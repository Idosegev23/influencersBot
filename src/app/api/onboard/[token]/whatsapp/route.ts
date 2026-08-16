import { NextRequest, NextResponse } from 'next/server';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { exchangeEsCode, assertWabaOwnership, runProvisioningChain } from '@/lib/whatsapp-cloud/provisioning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/onboard/[token]/whatsapp — the customer connects their own WhatsApp number.
 *
 * Body: { code, waba_id, phone_number_id } from the Embedded Signup popup.
 * There is NO accountId in the body, ever: the onboarding token resolves it server-side,
 * the same anti-IDOR pattern as the Instagram connect route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const code = body?.code;
  const wabaId = body?.waba_id;
  const phoneNumberId = body?.phone_number_id;
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: 'code, waba_id and phone_number_id are required' }, { status: 400 });
  }

  // The ES code lives ~30 seconds — exchanged here, synchronously, never deferred to a queue.
  let accessToken: string;
  try {
    accessToken = await exchangeEsCode(String(code));
  } catch (e) {
    console.error('[wa-connect] code exchange failed', e);
    return NextResponse.json({ error: 'exchange_failed' }, { status: 400 });
  }

  // The browser claimed waba_id; Meta decides whether that claim is true. Nothing is written
  // before this passes.
  try {
    await assertWabaOwnership(accessToken, String(wabaId));
  } catch (e) {
    console.warn('[wa-connect] ownership rejected', { accountId: draft.id, wabaId, e });
    return NextResponse.json({ error: 'waba_not_owned' }, { status: 403 });
  }

  const result = await runProvisioningChain({
    accountId: draft.id,
    accessToken,
    wabaId: String(wabaId),
    phoneNumberId: String(phoneNumberId),
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'provisioning_failed', failedStep: result.failedStep, state: result.state }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    channelId: result.channelId,
    state: result.state,
    // The wizard shows a waiting state (not a failure) until a template is approved and the
    // billing probe can run.
    paymentReady: false,
  }, { status: 200 });
}
