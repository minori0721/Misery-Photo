import { NextResponse } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireApiAuth } from '@/lib/auth';
import { isValidStoragePath, uniqStrings } from '@/lib/validation';
import { getBucketRuntimeFromRequest, noBucketConfiguredResponse } from '@/lib/bucket-config';

const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export async function GET(request: Request) {
  try {
    const unauthorized = await requireApiAuth(request);
    if (unauthorized) return unauthorized;

    const runtime = await getBucketRuntimeFromRequest(request);
    if (!runtime) return noBucketConfiguredResponse();

    const s3Client = runtime.client;
    const bucketName = runtime.bucketName;

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '';
    const jsonMode = searchParams.get('json') === '1';
    const foldersOnly = searchParams.get('foldersOnly') === '1';
    const continuationToken = searchParams.get('continuationToken') || undefined;
    const maxKeysParam = Number(searchParams.get('maxKeys') || 1000);
    const maxKeys = Number.isNaN(maxKeysParam) ? 1000 : Math.min(Math.max(maxKeysParam, 1), 1000);

    if (!isValidStoragePath(path, { allowEmpty: true, maxLength: 1024 })) {
      return NextResponse.json({ success: false, message: 'path 参数不合法' }, { status: 400 });
    }

    if (continuationToken && continuationToken.length > 2048) {
      return NextResponse.json({ success: false, message: 'continuationToken 过长' }, { status: 400 });
    }

    if (jsonMode) {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: path,
        Delimiter: '/',
      });

      const response = await s3Client.send(command);

      const foldersRaw = response.CommonPrefixes || [];
      const folders = foldersRaw.map((cp) => {
        const folderPath = cp.Prefix!;
        return {
          name: folderPath.replace(path, '').replace('/', '') || '',
          path: folderPath,
          type: 'folder',
          previews: [],
        };
      });

      const filesRaw = response.Contents || [];
      const filesFiltered = filesRaw.filter((file) => {
        if (file.Key === path) return false;
        const key = file.Key?.toLowerCase() || '';
        return key.endsWith('.jpg') || key.endsWith('.jpeg') || key.endsWith('.png') || key.endsWith('.webp') || key.endsWith('.gif');
      });
      filesFiltered.sort((a, b) => naturalSort(a.Key!, b.Key!));

      if (foldersOnly) {
        return NextResponse.json({
          success: true,
          mode: 'json',
          data: {
            folders,
            files: [],
            currentPath: path,
          },
        });
      }

      const files = await Promise.all(
        filesFiltered.map(async (file) => {
          const key = file.Key!;
          try {
            const signedUrl = await getSignedUrl(
              s3Client,
              new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
              }),
              { expiresIn: 3600 }
            );

            return {
              name: key.replace(path, '') || key,
              path: key,
              url: signedUrl,
              size: file.Size,
              lastModified: file.LastModified,
              type: 'image',
            };
          } catch {
            return null;
          }
        })
      );

      return NextResponse.json({
        success: true,
        mode: 'json',
        data: {
          folders,
          files: files.filter((f) => f !== null),
          currentPath: path,
        },
      });
    }

    // Signer mode: only sign ListObjectsV2 URL, bytes and XML parsing happen in browser.
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: path,
      Delimiter: '/',
      ContinuationToken: continuationToken,
      MaxKeys: maxKeys,
    });

    const listUrl = await getSignedUrl(s3Client, listCommand, { expiresIn: 900 });

    return NextResponse.json({
      success: true,
      mode: 'signer',
      data: {
        currentPath: path,
        listUrl,
      },
    });
  } catch (error: any) {
    console.error('S3 List Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '获取列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireApiAuth(request);
    if (unauthorized) return unauthorized;

    const runtime = await getBucketRuntimeFromRequest(request);
    if (!runtime) return noBucketConfiguredResponse();

    const s3Client = runtime.client;
    const bucketName = runtime.bucketName;

    const { action, keys } = await request.json() as {
      action: 'sign-get-objects';
      keys: string[];
    };

    if (action !== 'sign-get-objects') {
      return NextResponse.json({ success: false, message: '未知操作类型' }, { status: 400 });
    }

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ success: false, message: '缺少 keys' }, { status: 400 });
    }

    if (keys.length > 2000) {
      return NextResponse.json({ success: false, message: 'keys 数量超过上限 2000' }, { status: 400 });
    }

    const uniqKeys = uniqStrings(keys.map((k) => String(k))).slice(0, 2000);
    const invalidKey = uniqKeys.find((k) => !isValidStoragePath(k, { allowEmpty: false, maxLength: 1024 }));
    if (invalidKey) {
      return NextResponse.json({ success: false, message: '存在非法 key 路径' }, { status: 400 });
    }

    const signedEntries = await Promise.all(
      uniqKeys.map(async (key) => {
        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          }),
          { expiresIn: 3600 }
        );
        return [key, url] as const;
      })
    );

    return NextResponse.json({
      success: true,
      data: Object.fromEntries(signedEntries),
    });
  } catch (error: any) {
    console.error('S3 Sign GetObjects Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '签名失败' },
      { status: 500 }
    );
  }
}
