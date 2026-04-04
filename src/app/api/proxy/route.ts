import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new NextResponse('Missing URL', { status: 400 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from S3: ${response.statusText}`);
    }

    // 转发图片内容
    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    
    // 使用流式响应，减少内存压力
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
      },
    });
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
