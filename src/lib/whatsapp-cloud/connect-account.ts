/**
 * The WhatsApp connect endpoints, minus authentication.
 *
 * Three doors lead here — the onboarding wizard (token), the customer dashboard (influencer
 * session) and the support admin console (agent session). Each door resolves the account
 * id server-side and hands it in; nothing below ever takes an account id from the browser.
 */
import { supabase } from '@/lib/supabase';
import { exchangeEsCode, assertWabaOwnership, resolvePhoneNumberId, runProvisioningChain } from '@/lib/whatsapp-cloud/provisioning';
import { runBillingProbe } from '@/lib/whatsapp-cloud/billing-probe';

export interface ConnectOutcome { status: number; body: Record<string, unknown> }

/** Body: { code, waba_id, phone_number_id? } exactly as the Embedded Signup popup produced it. */
export async function connectAccountFromSignup(accountId: string, body: any): Promise<ConnectOutcome> {
  const code = body?.code;
  const wabaId = body?.waba_id;
  // Coexistence's FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING event carries only waba_id, so
  // phone_number_id is optional here and resolved from the WABA below when absent.
  let phoneNumberId: string | undefined = body?.phone_number_id ? String(body.phone_number_id) : undefined;
  if (!code || !wabaId) return { status: 400, body: { error: 'code and waba_id are required' } };

  // The ES code lives ~30 seconds — exchanged here, synchronously, never deferred to a queue.
  let accessToken: string;
  try {
    accessToken = await exchangeEsCode(String(code), body?.redirect_uri ? String(body.redirect_uri) : undefined);
  } catch (e: any) {
    console.error('[wa-connect] code exchange failed', e?.metaDetail ?? e);
    // Meta's own error fields make a live failure diagnosable from the browser. They carry no
    // credential and no authorization code.
    return { status: 400, body: { error: 'exchange_failed', meta: e?.metaDetail ?? null } };
  }

  // The browser claimed waba_id; Meta decides whether that claim is true. Nothing is written
  // before this passes.
  try {
    await assertWabaOwnership(accessToken, String(wabaId));
  } catch (e: any) {
    console.warn('[wa-connect] ownership rejected', { accountId, wabaId, detail: e?.ownershipDetail ?? String(e) });
    return { status: 403, body: { error: 'waba_not_owned', detail: e?.ownershipDetail ?? null } };
  }

  if (!phoneNumberId) {
    try { phoneNumberId = await resolvePhoneNumberId(accessToken, String(wabaId)); }
    catch (e) {
      console.error('[wa-connect] could not resolve a phone number', { wabaId, e });
      return { status: 400, body: { error: 'phone_number_unresolved' } };
    }
  }

  const result = await runProvisioningChain({ accountId, accessToken, wabaId: String(wabaId), phoneNumberId });
  if (!result.ok) {
    return { status: 500, body: { error: 'provisioning_failed', failedStep: result.failedStep, state: result.state } };
  }
  // paymentReady is false until a template is approved and the billing probe proves a card.
  return { status: 200, body: { ok: true, channelId: result.channelId, state: result.state, paymentReady: false } };
}

async function channelFor(accountId: string) {
  const { data } = await supabase
    .from('whatsapp_channels')
    .select('id, waba_id, display_phone_number, verified_name, status, payment_ready, templates, onboarding_mode, sync_initiated_at')
    .eq('account_id', accountId)
    .maybeSingle();
  return data as any;
}

/** GET …/whatsapp/billing — what the card shows. A disconnected channel counts as none. */
export async function channelStatus(accountId: string): Promise<ConnectOutcome> {
  const channel = await channelFor(accountId);
  if (!channel || channel.status === 'disconnected') return { status: 404, body: { error: 'not_found' } };
  return {
    status: 200,
    body: {
      wabaId: channel.waba_id,
      displayPhoneNumber: channel.display_phone_number,
      paymentReady: Boolean(channel.payment_ready),
      templateApproved: channel.templates?.cs_followup === 'APPROVED',
      status: channel.status,
      // Meta offboards a Coexistence customer whose sync never started; the card must say so.
      syncMissing: channel.onboarding_mode === 'coexistence' && !channel.sync_initiated_at,
    },
  };
}

/** POST …/whatsapp/billing — send the welcome template to prove a payment method exists. */
export async function probeChannelBilling(accountId: string): Promise<ConnectOutcome> {
  const channel = await channelFor(accountId);
  if (!channel || channel.status === 'disconnected') return { status: 404, body: { error: 'not_found' } };
  try {
    return { status: 200, body: (await runBillingProbe(channel.id)) as any };
  } catch (e) {
    console.error('[wa-billing] probe failed', e);
    return { status: 200, body: { paymentReady: false, reason: 'send_failed' } };
  }
}
