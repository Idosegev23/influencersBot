/**
 * The opening move of the lead funnel.
 *
 * After a form fill there is no open conversation — the lead has never written
 * to us — so this must be a pre-approved template. bestie_lead_intro_v1 carries
 * quick-reply buttons because the tap is itself an inbound message, and that
 * inbound is what opens the 24h window in which the bot can finally speak
 * freely. The template is the door, not the conversation.
 *
 * whatsapp-notify is imported lazily inside each sender: it pulls in the
 * Supabase client at module load, which throws without env. Keeping this module
 * import-clean is what lets introTemplateParams be unit-tested at all.
 */

export type BestieNudgeKind = 'nudge_24h' | 'nudge_72h';

/**
 * Meta rejects a template parameter containing newlines, tabs or long runs of
 * spaces (error 132018), and rejects an empty one outright — so a lead whose
 * name we never got still needs *something* in the slot.
 */
export function introTemplateParams(firstName: string | null | undefined): string[] {
  const cleaned = String(firstName ?? '').replace(/\s+/g, ' ').trim();
  return [cleaned || 'שלום'];
}

export async function sendLeadIntro(p: {
  waId: string;
  firstName: string | null;
}): Promise<{ success: boolean }> {
  const { sendBestieLeadIntro } = await import('@/lib/whatsapp-notify');
  const result = await sendBestieLeadIntro({
    to: p.waId,
    bodyParams: introTemplateParams(p.firstName),
  });
  return { success: Boolean(result?.success) };
}

export async function sendLeadNudge(p: {
  waId: string;
  firstName: string | null;
  kind: BestieNudgeKind;
}): Promise<{ success: boolean }> {
  const { sendBestieLeadNudge } = await import('@/lib/whatsapp-notify');
  const result = await sendBestieLeadNudge({
    to: p.waId,
    kind: p.kind,
    bodyParams: introTemplateParams(p.firstName),
  });
  return { success: Boolean(result?.success) };
}
