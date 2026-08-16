/**
 * Spec D7: a pause caused by a human replying from the WhatsApp Business app expires after
 * N hours of human silence. A deliberate manual takeover NEVER expires — only a person undoes
 * that one.
 *
 * Everything here fails closed: an unknown reason, a missing timestamp or an unparseable one
 * all keep the bot quiet. Wrongly staying silent is a delay; wrongly speaking is the bot
 * talking over a human mid-conversation with their own customer.
 */

export const DEFAULT_IDLE_RESUME_HOURS = 6;

export function shouldAutoResume(
  row: { bot_paused_reason: string | null; human_last_reply_at: string | null },
  idleHours: number = DEFAULT_IDLE_RESUME_HOURS,
  now: number = Date.now(),
): boolean {
  if (row?.bot_paused_reason !== 'human_reply') return false;
  if (!row.human_last_reply_at) return false;

  const last = Date.parse(row.human_last_reply_at);
  if (!Number.isFinite(last)) return false;   // a corrupt stamp must not read as "long ago"

  return now - last > idleHours * 3_600_000;
}

/** Per-account override, falling back to the 6h default (spec D7). */
export function idleResumeHours(config: any): number {
  const raw = config?.whatsapp_cs?.human_idle_resume_hours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_RESUME_HOURS;
}
