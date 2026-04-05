import { NextResponse } from 'next/server';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '@/lib/s3';

// 并发控制：每批最多并行 10 个 S3 操作
async function runChunked<T>(items: T[], chunkSize: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(fn));
  }
}

export async function POST(request: Request) {
  try {
    const { action, paths, dest } = await request.json() as {
      action: 'delete' | 'move' | 'copy';
      paths: string[];
      dest?: string;
    };

    if (!paths || paths.length === 0) {
      return NextResponse.json({ success: false, message: '未指定任何文件路径' }, { status: 400 });
    }

    // ────────────────────────────────
    // DELETE
    // ────────────────────────────────
    if (action === 'delete') {
      // AWS SDK DeleteObjects 单次最多 1000 个
      const chunkSize = 1000;
      for (let i = 0; i < paths.length; i += chunkSize) {
        const chunk = paths.slice(i, i + chunkSize);
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: chunk.map(key => ({ Key: key })),
            Quiet: true,
          },
        }));
      }
      return NextResponse.json({ success: true, message: `已删除 ${paths.length} 个文件` });
    }

    // ────────────────────────────────
    // COPY or MOVE (copy first, then optionally delete)
    // ────────────────────────────────
    if (action === 'copy' || action === 'move') {
      if (!dest) {
        return NextResponse.json({ success: false, message: '缺少目标路径 dest' }, { status: 400 });
      }

      // Copy all objects to destination
      await runChunked(paths, 10, async (srcKey) => {
        const fileName = srcKey.split('/').pop() || srcKey;
        const destKey = `${dest}${fileName}`;
        await s3Client.send(new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${srcKey}`,
          Key: destKey,
        }));
      });

      // If move, delete originals after all copies succeed
      if (action === 'move') {
        const chunkSize = 1000;
        for (let i = 0; i < paths.length; i += chunkSize) {
          const chunk = paths.slice(i, i + chunkSize);
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
              Objects: chunk.map(key => ({ Key: key })),
              Quiet: true,
            },
          }));
        }
      }

      const label = action === 'move' ? '移动' : '复制';
      return NextResponse.json({ success: true, message: `已${label} ${paths.length} 个文件到 ${dest}` });
    }

    return NextResponse.json({ success: false, message: '未知操作类型' }, { status: 400 });

  } catch (error: any) {
    console.error('Batch operation error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '批量操作失败' },
      { status: 500 }
    );
  }
}
