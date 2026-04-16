import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { sendTestEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const result = await sendTestEmail();
  return NextResponse.json(result);
}
