import { NextRequest, NextResponse } from 'next/server';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { supabase } from '@/lib/supabase';
import { runBillingProbe } from '@/lib/whatsapp-cloud/billing-probe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET  — current billing state for the wizard (poll while the customer adds their card).
 * POST — actively probe by sending a template to the customer's own number.
 *
 * Both resolve the account from the onboarding token; neither accepts an accountId or a
 * channelId from the client, so one customer can never probe another's channel.
 */
async function channelForToken(token: string) {
  const draft = await resolveDraftByToken(token);
  if (!draft) return null;
  const { data } = await supabase
    .from('whatsapp_channels')
    .select('id, waba_id, display_phone_number, verified_name, status, payment_ready, templates')
    .eq('account_id', draft.id)
    .maybeSingle();
  return data ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const channel = await channelForToken(token);
  if (!channel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    wabaId: (channel as any).waba_id,
    displayPhoneNumber: (channel as any).display_phone_number,
    paymentReady: Boolean((channel as any).payment_ready),
    templateApproved: (channel as any).templates?.cs_followup === 'APPROVED',
    status: (channel as any).status,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const channel = await channelForToken(token);
  if (!channel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const result = await runBillingProbe((channel as any).id);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error('[wa-billing] probe failed', e);
    return NextResponse.json({ paymentReady: false, reason: 'send_failed' }, { status: 200 });
  }
}
