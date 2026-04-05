import { NextResponse } from 'next/server';
import { assertAuthSecretConfigured, AUTH_COOKIE_NAME, buildSessionCookieOptions, createSessionToken } from '@/lib/auth';

type RateLimitState = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, RateLimitState>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 12;
const FAILURE_DELAY_MS = 500;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

function cleanExpiredRateLimits() {
  const now = Date.now();
  for (const [key, value] of loginAttempts.entries()) {
    if (value.resetAt <= now) {
      loginAttempts.delete(key);
    }
  }
}

function getRateLimitKey(request: Request, username: string): string {
  return `${getClientIp(request)}:${username.toLowerCase()}`;
}

async function delayFailedLogin() {
  await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
}

export async function POST(request: Request) {
  try {
    assertAuthSecretConfigured();
    cleanExpiredRateLimits();

    const { username, password } = await request.json();
    const safeUsername = typeof username === 'string' ? username.trim() : '';
    const safePassword = typeof password === 'string' ? password : '';

    if (!safeUsername || !safePassword || safeUsername.length > 128 || safePassword.length > 256) {
      await delayFailedLogin();
      return NextResponse.json(
        { success: false, message: '用户名或密码格式不正确' },
        { status: 400 }
      );
    }

    const rateKey = getRateLimitKey(request, safeUsername);
    const now = Date.now();
    const currentLimit = loginAttempts.get(rateKey);
    if (currentLimit && currentLimit.resetAt > now && currentLimit.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      return NextResponse.json(
        { success: false, message: '尝试次数过多，请稍后再试' },
        { status: 429 }
      );
    }

    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;

    if (safeUsername === adminUser && safePassword === adminPass) {
      const response = NextResponse.json({ success: true });
      const token = await createSessionToken();

      response.cookies.set(AUTH_COOKIE_NAME, token, buildSessionCookieOptions());
      loginAttempts.delete(rateKey);

      return response;
    }

    const nextState = currentLimit && currentLimit.resetAt > now
      ? { ...currentLimit, count: currentLimit.count + 1 }
      : { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    loginAttempts.set(rateKey, nextState);

    await delayFailedLogin();

    return NextResponse.json(
      { success: false, message: '用户名或密码错误' },
      { status: 401 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthConfigError') {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    );
  }
}
