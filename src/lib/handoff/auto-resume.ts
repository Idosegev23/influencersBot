/**
 * When a pause expires.
 *
 * Spec D7 covered ONE case: a human replied from the WhatsApp Business app, so the bot goes quiet
 * for N hours of human silence. A deliberate manual takeover never expires — only a person undoes
 * that one.
 *
 * What it did NOT cover is the case that actually happens most: `escalate_to_human` and the
 * detectHandoff backstop also call pauseBot, with `escalate:<reason>` and `handoff:<triggers>`.
 * Neither is 'human_reply', so both fell through the first line and NEVER expired. Measured
 * 2026-09-07: 141 muted WhatsApp threads, 107 customers who kept writing after the mute, 578
 * unanswered messages, the oldest muted five weeks. One of them, muted three weeks, wrote:
 * "אולי תענו כבר ותפסיקו עם הסימון עיניים הדבילי הזה????" — the 👀 reaction is fire-and-forget on
 * the webhook, so the bot looked alive and then said nothing, for ever.
 *
 * An escalation is not a takeover. It is a PROMISE that a human will come back. If no human comes,
 * the promise has failed and silence is the worst of the available answers — so the pause expires
 * and the bot speaks again. It gets a much longer window than a live human reply (a day, not six
 * hours), because a real agent must have room to pick the thread up first.
 *
 * Everything here fails closed: an unknown reason, a missing timestamp or an unparseable one all
 * keep the bot quiet. Wrongly staying silent is a delay; wrongly speaking is the bot talking over a
 * human mid-conversation with their own customer.
 */

export const DEFAULT_IDLE_RESUME_HOURS = 6;

/**
 * How long an unanswered escalation stays muted. Deliberately much longer than the human-reply
 * window: nobody has spoken yet, so this is the grace period a CS team gets to claim the thread
 * before the bot fills the silence.
 */
export const ESCALATION_IDLE_RESUME_HOURS = 24;

/** pauseBot reasons that mean "the bot handed off and is waiting for a human who may never come". */
function isEscalationPause(reason: string | null): boolean {
  return !!reason && (reason.startsWith('escalate:') || reason.startsWith('handoff:'));
}

function parsedOrNull(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : null;   // a corrupt stamp must not read as "long ago"
}

export function shouldAutoResume(
  row: {
    bot_paused_reason: string | null;
    human_last_reply_at: string | null;
    /** Only needed for escalation pauses, where nobody has replied and the clock runs from the mute. */
    bot_paused_at?: string | null;
  },
  idleHours: number = DEFAULT_IDLE_RESUME_HOURS,
  now: number = Date.now(),
): boolean {
  const reason = row?.bot_paused_reason ?? null;
  const humanLast = parsedOrNull(row?.human_last_reply_at);

  if (reason === 'human_reply') {
    if (humanLast === null) return false;
    return now - humanLast > idleHours * 3_600_000;
  }

  if (isEscalationPause(reason)) {
    // A human who has actually spoken restarts the clock from THEIR last message — the pause exists
    // to avoid talking over them, and that matters more than the age of the original escalation.
    const from = humanLast ?? parsedOrNull(row?.bot_paused_at);
    if (from === null) return false;
    return now - from > ESCALATION_IDLE_RESUME_HOURS * 3_600_000;
  }

  // 'manual' and anything unrecognised: only a person undoes it.
  return false;
}

/** Per-account override of the human-reply window, falling back to the 6h default (spec D7). */
export function idleResumeHours(config: any): number {
  const raw = config?.whatsapp_cs?.human_idle_resume_hours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_RESUME_HOURS;
}
