import { NextResponse } from 'next/server';
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '@/lib/s3';

export async function POST(request: Request) {
  try {
    const { path, type } = await request.json(); // type: 'image' | 'folder'

    if (type === 'image') {
      // 删除单图
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: path,
      });
      await s3Client.send(command);
    } else if (type === 'folder') {
      // 递归删除文件夹 (S3 需要先列出所有对象)
      let continuationToken: string | undefined = undefined;
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: path,
          ContinuationToken: continuationToken,
        });

        const listResponse: ListObjectsV2CommandOutput = await s3Client.send(listCommand);
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
              Objects: listResponse.Contents.map((item) => ({ Key: item.Key! })),
              Quiet: true,
            },
          });
          await s3Client.send(deleteCommand);
        }
        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('S3 Delete Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || '删除失败' },
      { status: 500 }
    );
  }
}
