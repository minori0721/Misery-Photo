import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '@/lib/s3';
import { requireApiAuth } from '@/lib/auth';
import { isValidStoragePath, toFolderPath } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const unauthorized = await requireApiAuth(request);
    if (unauthorized) return unauthorized;

    const { filename, path, contentType } = await request.json();
    if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255) {
      return NextResponse.json({ success: false, message: 'filename 不合法' }, { status: 400 });
    }

    if (!isValidStoragePath(filename, { allowEmpty: false, maxLength: 255 })) {
      return NextResponse.json({ success: false, message: 'filename 不合法' }, { status: 400 });
    }

    if (!isValidStoragePath(path, { allowEmpty: true, maxLength: 1024 })) {
      return NextResponse.json({ success: false, message: 'path 不合法' }, { status: 400 });
    }

    if (typeof contentType !== 'undefined' && (typeof contentType !== 'string' || contentType.length > 255)) {
      return NextResponse.json({ success: false, message: 'contentType 不合法' }, { status: 400 });
    }
    
    // 构造完整 Key
    const key = `${toFolderPath(path)}${filename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    // 生成 15 分钟有效的上传预签名 URL
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return NextResponse.json({
      success: true,
      url: signedUrl,
      key: key,
    });
  } catch (error: any) {
    console.error('S3 Upload Presign Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '获取上传链接失败' },
      { status: 500 }
    );
  }
}
