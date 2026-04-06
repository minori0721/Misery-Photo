import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireApiAuth } from '@/lib/auth';
import { getBucketRuntimeFromRequest, noBucketConfiguredResponse } from '@/lib/bucket-config';

const PROXY_TIMEOUT_MS = 15000;

function getAllowedProxyHosts(endpoint?: string): Set<string> {
  const hosts = new Set<string>();
  if (endpoint) {
    try {
      hosts.add(new URL(endpoint).hostname.toLowerCase());
    } catch {
      // Ignore invalid endpoint format and rely on explicit whitelist.
    }
  }

  const extraHosts = process.env.PROXY_ALLOWED_HOSTS;
  if (extraHosts) {
    extraHosts
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
      .forEach((host) => hosts.add(host));
  }
  return hosts;
}

export async function GET(request: Request) {
  try {
    const unauthorized = await requireApiAuth(request);
    if (unauthorized) return unauthorized;

    const runtime = await getBucketRuntimeFromRequest();
    if (!runtime) return noBucketConfiguredResponse();

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    // thumb 标志位：开启缩略图模式
    const isThumbnail = searchParams.get('thumbnail') === 'true';

    if (!url) {
      return NextResponse.json({ success: false, message: 'Missing URL' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ success: false, message: 'URL 格式不合法' }, { status: 400 });
    }

    if (parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ success: false, message: '仅允许 https 协议' }, { status: 400 });
    }

    const allowedHosts = getAllowedProxyHosts(runtime.endpoint);
    if (allowedHosts.size === 0 || !allowedHosts.has(parsedUrl.hostname.toLowerCase())) {
      return NextResponse.json({ success: false, message: '目标域名不在白名单中' }, { status: 403 });
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), PROXY_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), { signal: abortController.signal });
    } finally {
      clearTimeout(timeoutId);
    }
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
    if (error?.name === 'AbortError') {
      return NextResponse.json({ success: false, message: '上游请求超时' }, { status: 504 });
    }
    console.error('Proxy Error:', error);
    return NextResponse.json({ success: false, message: error.message || '代理请求失败' }, { status: 500 });
  }
}
