import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { runBillingProbe } from '@/lib/whatsapp-cloud/billing-probe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The session decides the account; no channel id is ever accepted from the client. */
async function channelForSession(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return { auth, channel: null as any };
  const { data } = await supabase
    .from('whatsapp_channels')
    .select('id, waba_id, display_phone_number, verified_name, status, payment_ready, templates')
    .eq('account_id', auth.influencer.id)
    .maybeSingle();
  return { auth, channel: data };
}

export async function GET(req: NextRequest) {
  const { auth, channel } = await channelForSession(req);
  if (!auth.authorized) return auth.response;
  if (!channel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    wabaId: (channel as any).waba_id,
    displayPhoneNumber: (channel as any).display_phone_number,
    paymentReady: Boolean((channel as any).payment_ready),
    templateApproved: (channel as any).templates?.cs_followup === 'APPROVED',
    status: (channel as any).status,
  });
}

export async function POST(req: NextRequest) {
  const { auth, channel } = await channelForSession(req);
  if (!auth.authorized) return auth.response;
  if (!channel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    return NextResponse.json(await runBillingProbe((channel as any).id), { status: 200 });
  } catch (e) {
    console.error('[wa-billing] probe failed', e);
    return NextResponse.json({ paymentReady: false, reason: 'send_failed' }, { status: 200 });
  }
}
