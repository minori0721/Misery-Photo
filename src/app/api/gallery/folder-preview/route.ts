import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';

// Deprecated: preview flow moved to direct signer mode in page.tsx.
export async function GET(request: Request) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    { success: false, message: 'Deprecated endpoint' },
    { status: 410 }
  );
}
