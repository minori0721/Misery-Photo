import { NextResponse } from 'next/server';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '@/lib/s3';
import { requireApiAuth } from '@/lib/auth';
import { getPathBaseName, isValidStoragePath, toFolderPath, uniqStrings } from '@/lib/validation';

const MAX_BATCH_PATHS = 1000;
const MAX_PATH_LENGTH = 1024;

// 并发控制：每批最多并行 10 个 S3 操作
async function runChunked<T>(items: T[], chunkSize: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(fn));
  }
}

async function listFolderKeysRecursively(folderPath: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: folderPath,
      ContinuationToken: continuationToken,
    });

    const response: ListObjectsV2CommandOutput = await s3Client.send(command);
    if (response.Contents?.length) {
      response.Contents.forEach((item) => {
        if (item.Key) keys.push(item.Key);
      });
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function resolveDeleteKeys(paths: string[]): Promise<string[]> {
  const allKeys: string[] = [];
  for (const rawPath of paths) {
    if (rawPath.endsWith('/')) {
      const folderPath = toFolderPath(rawPath);
      const folderKeys = await listFolderKeysRecursively(folderPath);
      allKeys.push(...folderKeys);
    } else {
      allKeys.push(rawPath);
    }
  }
  return uniqStrings(allKeys);
}

type CopyTask = {
  srcKey: string;
  destKey: string;
};

async function resolveCopyTasks(paths: string[], dest: string): Promise<CopyTask[]> {
  const destFolder = toFolderPath(dest);
  const tasks: CopyTask[] = [];

  for (const rawPath of paths) {
    if (rawPath.endsWith('/')) {
      const folderPath = toFolderPath(rawPath);
      const folderName = getPathBaseName(folderPath);
      const keys = await listFolderKeysRecursively(folderPath);
      for (const key of keys) {
        const relative = key.slice(folderPath.length);
        if (!relative) continue;
        tasks.push({
          srcKey: key,
          destKey: `${destFolder}${folderName}/${relative}`,
        });
      }
      continue;
    }

    const fileName = rawPath.split('/').pop() || rawPath;
    tasks.push({
      srcKey: rawPath,
      destKey: `${destFolder}${fileName}`,
    });
  }

  return tasks;
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireApiAuth(request);
    if (unauthorized) return unauthorized;

    const { action, paths, dest } = await request.json() as {
      action: 'delete' | 'move' | 'copy';
      paths: string[];
      dest?: string;
    };

    if (action !== 'delete' && action !== 'move' && action !== 'copy') {
      return NextResponse.json({ success: false, message: '未知操作类型' }, { status: 400 });
    }

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ success: false, message: '未指定任何文件路径' }, { status: 400 });
    }

    if (paths.length > MAX_BATCH_PATHS) {
      return NextResponse.json({ success: false, message: `paths 数量超过上限 ${MAX_BATCH_PATHS}` }, { status: 400 });
    }

    const uniquePaths = uniqStrings(paths.map((p) => String(p)));
    const invalidPath = uniquePaths.find((p) => !isValidStoragePath(p, { allowEmpty: false, maxLength: MAX_PATH_LENGTH }));
    if (invalidPath) {
      return NextResponse.json({ success: false, message: '存在非法路径' }, { status: 400 });
    }

    if ((action === 'copy' || action === 'move')) {
      if (typeof dest !== 'string') {
        return NextResponse.json({ success: false, message: '缺少目标路径 dest' }, { status: 400 });
      }
      if (!isValidStoragePath(dest, { allowEmpty: true, maxLength: MAX_PATH_LENGTH })) {
        return NextResponse.json({ success: false, message: 'dest 路径不合法' }, { status: 400 });
      }

      const destFolder = toFolderPath(dest);
      const conflictFolder = uniquePaths.find((p) => p.endsWith('/') && destFolder.startsWith(toFolderPath(p)));
      if (conflictFolder) {
        return NextResponse.json({ success: false, message: '目标路径不能位于源文件夹内部' }, { status: 400 });
      }
    }

    // ────────────────────────────────
    // DELETE
    // ────────────────────────────────
    if (action === 'delete') {
      const objectKeys = await resolveDeleteKeys(uniquePaths);
      if (objectKeys.length === 0) {
        return NextResponse.json({ success: true, message: '没有可删除的对象' });
      }

      // AWS SDK DeleteObjects 单次最多 1000 个
      const chunkSize = 1000;
      for (let i = 0; i < objectKeys.length; i += chunkSize) {
        const chunk = objectKeys.slice(i, i + chunkSize);
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: chunk.map(key => ({ Key: key })),
            Quiet: true,
          },
        }));
      }
      return NextResponse.json({ success: true, message: `已删除 ${objectKeys.length} 个对象` });
    }

    // ────────────────────────────────
    // COPY or MOVE (copy first, then optionally delete)
    // ────────────────────────────────
    if (action === 'copy' || action === 'move') {
      const targetDest = toFolderPath(dest || '');
      const copyTasks = await resolveCopyTasks(uniquePaths, targetDest);

      if (copyTasks.length === 0) {
        return NextResponse.json({ success: true, message: '没有可处理的对象' });
      }

      const effectiveTasks = copyTasks.filter((task) => task.srcKey !== task.destKey);

      // Copy all objects to destination
      await runChunked(effectiveTasks, 10, async (task) => {
        await s3Client.send(new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${task.srcKey}`,
          Key: task.destKey,
        }));
      });

      // If move, delete originals after all copies succeed
      if (action === 'move') {
        const deleteSourceKeys = uniqStrings(effectiveTasks.map((task) => task.srcKey));
        const chunkSize = 1000;
        for (let i = 0; i < deleteSourceKeys.length; i += chunkSize) {
          const chunk = deleteSourceKeys.slice(i, i + chunkSize);
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
      return NextResponse.json({ success: true, message: `已${label} ${effectiveTasks.length} 个对象到 ${targetDest || '/'}` });
    }

  } catch (error: any) {
    console.error('Batch operation error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '批量操作失败' },
      { status: 500 }
    );
  }
}
