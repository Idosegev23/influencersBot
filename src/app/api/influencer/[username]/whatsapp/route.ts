import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { exchangeEsCode, assertWabaOwnership, resolvePhoneNumberId, runProvisioningChain } from '@/lib/whatsapp-cloud/provisioning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/influencer/[username]/whatsapp — an EXISTING customer connects their number
 * from their own dashboard.
 *
 * Same flow as the onboarding wizard, different door. The account comes from the session,
 * never from the request body — a logged-in customer can only ever connect their own.
 */
export async function POST(req: NextRequest) {
  const auth = await requireInfluencerAuth(req);
  if (!auth.authorized) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const code = body?.code;
  const wabaId = body?.waba_id;
  // Coexistence returns only waba_id; the number is resolved from the WABA below.
  let phoneNumberId: string | undefined = body?.phone_number_id ? String(body.phone_number_id) : undefined;
  if (!code || !wabaId) {
    return NextResponse.json({ error: 'code and waba_id are required' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await exchangeEsCode(String(code), body?.redirect_uri ? String(body.redirect_uri) : undefined);
  } catch (e: any) {
    console.error('[wa-connect] code exchange failed', e?.metaDetail ?? e);
    return NextResponse.json({ error: 'exchange_failed', meta: e?.metaDetail ?? null }, { status: 400 });
  }

  try {
    await assertWabaOwnership(accessToken, String(wabaId));
  } catch (e: any) {
    console.warn('[wa-connect] ownership rejected', { accountId: auth.influencer.id, wabaId, detail: e?.ownershipDetail ?? String(e) });
    return NextResponse.json({ error: 'waba_not_owned', detail: e?.ownershipDetail ?? null }, { status: 403 });
  }

  if (!phoneNumberId) {
    try { phoneNumberId = await resolvePhoneNumberId(accessToken, String(wabaId)); }
    catch (e) {
      console.error('[wa-connect] could not resolve a phone number', { wabaId, e });
      return NextResponse.json({ error: 'phone_number_unresolved' }, { status: 400 });
    }
  }

  const result = await runProvisioningChain({
    accountId: auth.influencer.id, accessToken, wabaId: String(wabaId), phoneNumberId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'provisioning_failed', failedStep: result.failedStep, state: result.state }, { status: 500 });
  }
  return NextResponse.json({ ok: true, channelId: result.channelId, state: result.state, paymentReady: false });
}
