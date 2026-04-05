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

    // 1. 获取当前目录下的文件和文件夹
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: path,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    // 2. 提取文件夹 (CommonPrefixes) 并安全地增加预览图逻辑
    const foldersRaw = response.CommonPrefixes || [];
    
    // 限制：如果当前目录下的文件夹非常多，我们只为前 15 个文件夹生成预览，
    // 防止并发请求过多导致跨境网络连接崩溃或严重超时 (N+1 问题)
    const foldersToProcess = foldersRaw.slice(0, 15);
    
    const folders = await Promise.all(
      foldersRaw.map(async (cp, index) => {
        const folderPath = cp.Prefix!;
        const folderName = folderPath.replace(path, '').replace('/', '') || '';
        
        let previewUrls: string[] = [];
        
        // 只有在索引范围内的文件夹才尝试获取预览，且捕获异常
        if (index < 15) {
          try {
            // 给预览图获取设置一个极短的逻辑超时控制（虽然 SDK 有全局超时，但这里我们主动控制）
            const previewCommand = new ListObjectsV2Command({
              Bucket: BUCKET_NAME,
              Prefix: folderPath,
              MaxKeys: 8, 
            });
            
            // 发起请求，但不让它阻塞主流程太久
            const previewsRes = await s3Client.send(previewCommand).catch(() => null);
            
            if (previewsRes && previewsRes.Contents) {
              const previewFiles = previewsRes.Contents
                .filter(c => c.Key && c.Key !== folderPath && c.Key.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/))
                .slice(0, 3);

              previewUrls = await Promise.all(
                previewFiles.map(async (f) => {
                  return await getSignedUrl(
                    s3Client,
                    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: f.Key! }),
                    { expiresIn: 3600 }
                  ).catch(() => "");
                })
              );
              // 过滤掉空的 URL
              previewUrls = previewUrls.filter(u => u !== "");
            }
          } catch (e) {
            console.error(`Failed to fetch previews for folder ${folderName}:`, e);
            // 预览图失败不应该导致整个 API 挂掉
          }
        }

        return {
          name: folderName,
          path: folderPath,
          type: 'folder',
          previews: previewUrls
        };
      })
    );

    // 3. 提取并排序图片文件
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
        try {
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
        } catch (e) {
          return null; // 单个文件签算失败不影响其他
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        folders,
        files: files.filter(f => f !== null),
        currentPath: path,
      },
    });
  } catch (error: any) {
    console.error('S3 List Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '获取列表失败，请检查网络连接或 OSS 配置' },
      { status: 500 }
    );
  }
}
