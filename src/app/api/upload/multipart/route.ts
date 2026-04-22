import { NextResponse } from 'next/server';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireApiAuth } from '@/lib/auth';
import { isValidStoragePath, toFolderPath } from '@/lib/validation';
import { getBucketRuntimeFromRequest, noBucketConfiguredResponse } from '@/lib/bucket-config';
import { getErrorMessage, isRecord } from '@/lib/error-utils';

type CreateActionPayload = {
  action: 'create';
  filename: string;
  path: string;
  contentType?: string;
  size: number;
  partSize?: number;
};

type SignPartActionPayload = {
  action: 'sign-part';
  uploadId: string;
  key: string;
  partNumber: number;
};

type CompleteActionPayload = {
  action: 'complete';
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
};

type AbortActionPayload = {
  action: 'abort';
  uploadId: string;
  key: string;
};

type ListPartsActionPayload = {
  action: 'list-parts';
  uploadId: string;
  key: string;
};

const MIN_PART_SIZE = 5 * 1024 * 1024;
const MAX_PART_SIZE = 128 * 1024 * 1024;
const DEFAULT_PART_SIZE = 32 * 1024 * 1024;

function isNonEmptyString(value: unknown, maxLength = 2048): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireApiAuth(request);
    if (unauthorized) return unauthorized;

    const runtime = await getBucketRuntimeFromRequest(request);
    if (!runtime) return noBucketConfiguredResponse();

    const payload = (await request.json()) as unknown;
    if (!isRecord(payload) || typeof payload.action !== 'string') {
      return NextResponse.json({ success: false, message: '请求体格式不合法' }, { status: 400 });
    }

    const s3Client = runtime.client;
    const bucketName = runtime.bucketName;
    const action = payload.action;

    if (action === 'create') {
      const body = payload as Partial<CreateActionPayload>;
      const filename = body.filename;
      const path = body.path;
      const contentType = body.contentType;
      const size = body.size;
      const requestedPartSize = body.partSize;

      if (!isNonEmptyString(filename, 255) || !isValidStoragePath(filename, { allowEmpty: false, maxLength: 255 })) {
        return NextResponse.json({ success: false, message: 'filename 不合法' }, { status: 400 });
      }
      if (typeof path !== 'string' || !isValidStoragePath(path, { allowEmpty: true, maxLength: 1024 })) {
        return NextResponse.json({ success: false, message: 'path 不合法' }, { status: 400 });
      }
      if (typeof contentType !== 'undefined' && (typeof contentType !== 'string' || contentType.length > 255)) {
        return NextResponse.json({ success: false, message: 'contentType 不合法' }, { status: 400 });
      }
      if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
        return NextResponse.json({ success: false, message: 'size 不合法' }, { status: 400 });
      }

      const partSize = Math.min(
        MAX_PART_SIZE,
        Math.max(MIN_PART_SIZE, Number.isFinite(requestedPartSize ?? NaN) ? Number(requestedPartSize) : DEFAULT_PART_SIZE)
      );

      const key = `${toFolderPath(path)}${filename}`;
      const command = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      });
      const response = await s3Client.send(command);

      if (!response.UploadId) {
        return NextResponse.json({ success: false, message: '创建分片上传会话失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: {
          uploadId: response.UploadId,
          key,
          partSize,
        },
      });
    }

    if (action === 'sign-part') {
      const body = payload as Partial<SignPartActionPayload>;
      if (!isNonEmptyString(body.uploadId, 2048) || !isNonEmptyString(body.key, 1024)) {
        return NextResponse.json({ success: false, message: 'uploadId 或 key 不合法' }, { status: 400 });
      }
      if (!isValidStoragePath(body.key, { allowEmpty: false, maxLength: 1024 })) {
        return NextResponse.json({ success: false, message: 'key 不合法' }, { status: 400 });
      }
      if (!Number.isInteger(body.partNumber) || Number(body.partNumber) <= 0 || Number(body.partNumber) > 10000) {
        return NextResponse.json({ success: false, message: 'partNumber 不合法' }, { status: 400 });
      }

      const command = new UploadPartCommand({
        Bucket: bucketName,
        Key: body.key,
        UploadId: body.uploadId,
        PartNumber: Number(body.partNumber),
      });
      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return NextResponse.json({
        success: true,
        data: { url },
      });
    }

    if (action === 'complete') {
      const body = payload as Partial<CompleteActionPayload>;
      if (!isNonEmptyString(body.uploadId, 2048) || !isNonEmptyString(body.key, 1024)) {
        return NextResponse.json({ success: false, message: 'uploadId 或 key 不合法' }, { status: 400 });
      }
      if (!Array.isArray(body.parts) || body.parts.length === 0) {
        return NextResponse.json({ success: false, message: 'parts 不合法' }, { status: 400 });
      }

      const invalidPart = body.parts.find((part) => {
        return !part || !Number.isInteger(part.partNumber) || part.partNumber <= 0 || typeof part.etag !== 'string' || !part.etag;
      });
      if (invalidPart) {
        return NextResponse.json({ success: false, message: 'parts 包含非法项' }, { status: 400 });
      }

      const sortedParts = [...body.parts]
        .map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        }))
        .sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0));

      await s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: body.key,
          UploadId: body.uploadId,
          MultipartUpload: {
            Parts: sortedParts,
          },
        })
      );

      return NextResponse.json({ success: true });
    }

    if (action === 'abort') {
      const body = payload as Partial<AbortActionPayload>;
      if (!isNonEmptyString(body.uploadId, 2048) || !isNonEmptyString(body.key, 1024)) {
        return NextResponse.json({ success: false, message: 'uploadId 或 key 不合法' }, { status: 400 });
      }

      await s3Client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucketName,
          Key: body.key,
          UploadId: body.uploadId,
        })
      );

      return NextResponse.json({ success: true });
    }

    if (action === 'list-parts') {
      const body = payload as Partial<ListPartsActionPayload>;
      if (!isNonEmptyString(body.uploadId, 2048) || !isNonEmptyString(body.key, 1024)) {
        return NextResponse.json({ success: false, message: 'uploadId 或 key 不合法' }, { status: 400 });
      }

      const listed = await s3Client.send(
        new ListPartsCommand({
          Bucket: bucketName,
          Key: body.key,
          UploadId: body.uploadId,
        })
      );

      return NextResponse.json({
        success: true,
        data: {
          parts: (listed.Parts || []).map((part) => ({
            partNumber: part.PartNumber,
            etag: part.ETag,
            size: part.Size,
          })),
        },
      });
    }

    return NextResponse.json({ success: false, message: '未知操作类型' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Multipart Upload Error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, '分片上传接口异常') },
      { status: 500 }
    );
  }
}
