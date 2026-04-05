import { NextResponse } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '@/lib/s3';

/**
 * v0.5.0 新增异步预览接口
 * 专门为一个特定的文件夹获取 3 张预览图签。
 * 被前端 FolderCard 组件异步调用，极大提升画廊首屏加载体验。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderPath = searchParams.get('path');

    if (!folderPath) {
      return NextResponse.json({ success: false, message: 'Missing path' }, { status: 400 });
    }

    // 1. 列出该文件夹下的前几个对象
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: folderPath,
      MaxKeys: 12, // 尝试前12个，多拿一点以防有非图片
    });

    const response = await s3Client.send(command);

    // 2. 提取图片
    const previewFiles = (response.Contents || [])
      .filter(c => c.Key && c.Key !== folderPath && c.Key.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/))
      .slice(0, 3);

    // 3. 生成签名 URL
    const previews = await Promise.all(
      previewFiles.map(async (f) => {
        try {
          return await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: f.Key!,
            }),
            { expiresIn: 3600 }
          );
        } catch {
          return "";
        }
      })
    );

    return NextResponse.json({
      success: true,
      previews: previews.filter(p => p !== "")
    });
  } catch (error: any) {
    console.error('Folder Preview Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
