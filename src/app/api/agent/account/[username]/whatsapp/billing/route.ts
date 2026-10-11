import { NextRequest, NextResponse } from 'next/server';
import { requireAgentAdmin } from '@/lib/auth/require-agent-admin';
import { channelStatus, probeChannelBilling } from '@/lib/whatsapp-cloud/connect-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ username: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAgentAdmin(decodeURIComponent((await params).username));
  if ('res' in auth) return auth.res;
  const out = await channelStatus(auth.session.account_id);
  return NextResponse.json(out.body, { status: out.status });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAgentAdmin(decodeURIComponent((await params).username));
  if ('res' in auth) return auth.res;
  const out = await probeChannelBilling(auth.session.account_id);
  return NextResponse.json(out.body, { status: out.status });
}
