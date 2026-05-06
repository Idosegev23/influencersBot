import { NextRequest, NextResponse } from 'next/server';
import { logoutAgent } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let accountUsername = '';
  try {
    const body = await req.json();
    accountUsername = typeof body?.accountUsername === 'string' ? body.accountUsername : '';
  } catch {}

  if (!accountUsername) {
    return NextResponse.json({ ok: false, error: 'bad_input' }, { status: 400 });
  }

  await logoutAgent(accountUsername);
  return NextResponse.json({ ok: true });
}
