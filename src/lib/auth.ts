import { NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'nebula_session';
const SESSION_EXPIRES_SECONDS = 60 * 60 * 24 * 7;

class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new AuthConfigError('AUTH_SECRET 未配置或长度过短（至少 16 位）');
  }
  return secret;
}

function encodeBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = normalized + padding;

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signMessage(message: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return encodeBase64Url(new Uint8Array(signature));
}

type SessionPayload = {
  iat: number;
  exp: number;
};

export async function createSessionToken(expiresInSeconds = SESSION_EXPIRES_SECONDS): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    iat: now,
    exp: now + expiresInSeconds,
  };

  const payloadEncoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signMessage(payloadEncoded, getAuthSecret());
  return `${payloadEncoded}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) return false;

  let payload: SessionPayload;
  try {
    const payloadBytes = decodeBase64Url(payloadEncoded);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return false;
  }

  const secret = getAuthSecret();
  const key = await importSigningKey(secret);
  const expectedSigBytes = decodeBase64Url(signature);
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    expectedSigBytes as BufferSource,
    new TextEncoder().encode(payloadEncoded)
  );

  if (!verified) return false;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return false;
  return true;
}

export function readCookieFromHeader(cookieHeader: string | null, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === cookieName) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

export async function requireApiAuth(request: Request): Promise<NextResponse | null> {
  try {
    const token = readCookieFromHeader(request.headers.get('cookie'), AUTH_COOKIE_NAME);
    const valid = await verifySessionToken(token);
    if (!valid) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' },
        { status: 401 }
      );
    }
    return null;
  } catch (error) {
    if (error instanceof AuthConfigError) {
      return NextResponse.json(
        { success: false, code: 'SERVER_CONFIG_ERROR', message: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, code: 'AUTH_CHECK_FAILED', message: '鉴权检查失败' },
      { status: 500 }
    );
  }
}

export function buildSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_EXPIRES_SECONDS,
    path: '/',
  };
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
}

export function assertAuthSecretConfigured() {
  getAuthSecret();
}
