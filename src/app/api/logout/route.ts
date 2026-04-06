import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { clearLegacyBucketStateCookie } from '@/lib/bucket-config';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  clearLegacyBucketStateCookie(response);
  return response;
}
