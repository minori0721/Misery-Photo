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

    // 1. 获取当前目录下的文件和文件夹 (单次列表请求，极速)
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: path,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    // 2. 提取文件夹 (CommonPrefixes) 
    // v0.5.0: 不再同步获取预览图，将负载转移到前端组件异步请求，彻底解决 N+1 延迟问题
    const foldersRaw = response.CommonPrefixes || [];
    const folders = foldersRaw.map((cp) => {
      const folderPath = cp.Prefix!;
      return {
        name: folderPath.replace(path, '').replace('/', '') || '',
        path: folderPath,
        type: 'folder',
        // 预览图改为由前端根据 path 异步加载，接口初始返回空数组
        previews: []
      };
    });

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
      { success: false, message: error.message || '获取列表失败' },
      { status: 500 }
    );
  }
}
