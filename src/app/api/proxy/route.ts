import { NextResponse } from 'next/server';
import sharp from 'sharp';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    // thumb 标志位：开启缩略图模式
    const isThumbnail = searchParams.get('thumbnail') === 'true';

    if (!url) {
      return new NextResponse('Missing URL', { status: 400 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from S3: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    const contentLength = parseInt(response.headers.get('Content-Length') || '0');

    // 如果开启了缩略图模式且文件较大（超过 2MB），则在服务器端进行高效率压缩
    if (isThumbnail && contentLength > 2 * 1024 * 1024 && contentType.startsWith('image/')) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 调整尺寸到 1200px 宽，并压缩画质到 70% JPEG
      const compressedBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 70, progressive: true })
        .toBuffer();

      // 将 Node.js Buffer 转换为标准的 Uint8Array 以符合 NextResponse 类型要求
      return new NextResponse(new Uint8Array(compressedBuffer), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=86400',
        },
      });
    }

    // 默认行为：直传流，节省服务器内存并保留原始画质
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
