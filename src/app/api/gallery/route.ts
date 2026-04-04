import { NextResponse } from 'next/server';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '@/lib/s3';

// 自然排序辅助函数
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || ''; // 例如 'travel/'

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: path,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    // 提取文件夹 (CommonPrefixes) 并增加预览图逻辑
    const foldersRaw = response.CommonPrefixes || [];
    const folders = await Promise.all(
      foldersRaw.map(async (cp) => {
        const folderPath = cp.Prefix!;
        
        // 为每个文件夹获取前 3 个对象作为预览
        const previewCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: folderPath,
          MaxKeys: 10, // 多拿几个以防有非图片文件
        });
        const previewsRes = await s3Client.send(previewCommand);
        
        const previewFiles = (previewsRes.Contents || [])
          .filter(c => c.Key?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/))
          .slice(0, 3);

        const previewUrls = await Promise.all(
          previewFiles.map(async (f) => {
             return await getSignedUrl(
               s3Client,
               new GetObjectCommand({ Bucket: BUCKET_NAME, Key: f.Key! }),
               { expiresIn: 3600 }
             );
          })
        );

        return {
          name: folderPath.replace(path, '').replace('/', '') || '',
          path: folderPath,
          type: 'folder',
          previews: previewUrls
        };
      })
    );

    // 提取并排序图片文件
    const filesRaw = response.Contents || [];
    const filesFiltered = filesRaw.filter((file) => {
      if (file.Key === path) return false;
      const key = file.Key?.toLowerCase() || '';
      return key.endsWith('.jpg') || key.endsWith('.jpeg') || key.endsWith('.png') || key.endsWith('.webp') || key.endsWith('.gif');
    });

    // 关键：按名称自然排序
    filesFiltered.sort((a, b) => naturalSort(a.Key!, b.Key!));

    const files = await Promise.all(
      filesFiltered.map(async (file) => {
        const key = file.Key!;
        const signedUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
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
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        folders,
        files,
        currentPath: path,
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
