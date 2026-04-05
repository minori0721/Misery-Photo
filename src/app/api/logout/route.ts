import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { clearBucketStateCookie } from '@/lib/bucket-config';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  clearBucketStateCookie(response);
  return response;
}
