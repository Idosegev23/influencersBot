import { NextRequest, NextResponse } from 'next/server';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { channelStatus, probeChannelBilling } from '@/lib/whatsapp-cloud/connect-account';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET  — current billing state for the wizard (poll while the customer adds their card).
 * POST — actively probe by sending a template to the customer's own number.
 *
 * Both resolve the account from the onboarding token; neither accepts an accountId or a
 * channelId from the client, so one customer can never probe another's channel.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const draft = await resolveDraftByToken((await params).token);
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const out = await channelStatus(draft.id);
  return NextResponse.json(out.body, { status: out.status });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const draft = await resolveDraftByToken((await params).token);
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const out = await probeChannelBilling(draft.id);
  return NextResponse.json(out.body, { status: out.status });
}
