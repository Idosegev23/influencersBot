import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { channelStatus, probeChannelBilling } from '@/lib/whatsapp-cloud/connect-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The session decides the account; no channel id is ever accepted from the client. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const auth = await requireInfluencerAuth(req, decodeURIComponent((await params).username));
  if (!auth.authorized) return auth.response;
  const out = await channelStatus(auth.influencer.id);
  return NextResponse.json(out.body, { status: out.status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const auth = await requireInfluencerAuth(req, decodeURIComponent((await params).username));
  if (!auth.authorized) return auth.response;
  const out = await probeChannelBilling(auth.influencer.id);
  return NextResponse.json(out.body, { status: out.status });
}
