import { NextResponse } from 'next/server';

// Deprecated: preview flow moved to direct signer mode in page.tsx.
export async function GET() {
  return NextResponse.json(
    { success: false, message: 'Deprecated endpoint' },
    { status: 410 }
  );
}
