import type { WhatsAppSendResult } from '@/lib/whatsapp-cloud/client';

/**
 * Billing verification (spec D8).
 *
 * Meta bills the customer's own card on their own WABA — we never touch payment. The only
 * way to know the card actually works is to send a real template and watch it land, so the
 * channel stays 'pending' until one does.
 */

/** Meta returns 131042 when the WABA has no valid payment method attached. */
export const NO_CARD_ERROR_CODE = 131042;

export function isNoCardError(result: WhatsAppSendResult): boolean {
  return !result?.success && result?.error?.code === NO_CARD_ERROR_CODE;
}

export type BillingProbeReason = 'no_card' | 'template_pending' | 'send_failed';

/**
 * Send the CS follow-up template to the customer's own number.
 *
 * Runs only once a template is APPROVED — before that the probe cannot distinguish "no card"
 * from "nothing to send", so it reports template_pending and the wizard shows a waiting state
 * rather than an error.
 */
export async function runBillingProbe(
  channelId: string,
): Promise<{ paymentReady: boolean; reason?: BillingProbeReason }> {
  const { resolveWaChannelById } = await import('@/lib/whatsapp-cloud/channels');
  const { sendTemplate } = await import('@/lib/whatsapp-cloud/client');
  const { metaLanguageCode } = await import('@/lib/whatsapp-cloud/cs-templates');
  const { supabase } = await import('@/lib/supabase');

  const channel = await resolveWaChannelById(channelId);

  const { data: row } = await supabase
    .from('whatsapp_channels')
    .select('templates, account_id')
    .eq('id', channelId)
    .maybeSingle();

  const status = (row as any)?.templates?.cs_followup;
  if (status !== 'APPROVED') {
    return { paymentReady: false, reason: 'template_pending' };
  }

  const { data: acct } = await supabase
    .from('accounts').select('language').eq('id', (row as any).account_id).maybeSingle();

  const businessName = channel.verifiedName || 'העסק';
  const to = (channel.displayPhoneNumber ?? '').replace(/\D/g, '');
  if (!to) return { paymentReady: false, reason: 'send_failed' };

  const res = await sendTemplate({
    to,
    templateName: 'cs_followup',
    languageCode: metaLanguageCode((acct as any)?.language),
    components: [{ type: 'body', parameters: [
      { type: 'text', text: businessName },
      { type: 'text', text: businessName },
    ] }],
    channel,
  });

  const paymentReady = res.success;
  await supabase
    .from('whatsapp_channels')
    .update({ payment_ready: paymentReady, status: paymentReady ? 'active' : 'pending' })
    .eq('id', channelId);

  if (isNoCardError(res)) return { paymentReady: false, reason: 'no_card' };
  return paymentReady ? { paymentReady: true } : { paymentReady: false, reason: 'send_failed' };
}

/**
 * Runtime guard: a card can expire long after onboarding. Any send that fails with 131042
 * demotes the channel so the admin badge and the wizard both tell the truth.
 */
export async function noteNoCardFailure(channelId: string, result: WhatsAppSendResult): Promise<void> {
  if (!isNoCardError(result)) return;
  const { supabase } = await import('@/lib/supabase');
  await supabase.from('whatsapp_channels').update({ payment_ready: false }).eq('id', channelId);
  console.error('[billing] channel lost its payment method (131042)', { channelId });
}
