import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, assertAuthSecretConfigured, verifySessionToken } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行登录页、登录接口、退出接口与静态资源
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  try {
    assertAuthSecretConfigured();
  } catch (error) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, code: 'SERVER_CONFIG_ERROR', message: error instanceof Error ? error.message : 'AUTH_SECRET 未配置' },
        { status: 500 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isValid = await verifySessionToken(session);

  if (!isValid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' },
        { status: 401 }
      );
    }
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
