/**
 * When to follow up, and when to stop.
 *
 * Pure decision, no I/O, so the timing rules can be tested without waiting three
 * days. The cron applies whatever this returns.
 *
 * Only leads in `greeted` are ever nudged. Someone who replied is `engaged` and
 * belongs to the conversation; someone handed to sales belongs to a person; and
 * someone we never reached has nothing to be reminded of.
 */

export type NudgeAction = 'nudge_24h' | 'nudge_72h' | 'give_up';

export interface NudgeableLead {
  status: string;
  greeted_at: string | null;
  nudge_24h_at?: string | null;
  nudge_72h_at?: string | null;
  last_inbound_at?: string | null;
}

const HOUR = 3600_000;
const FIRST_NUDGE_AFTER = 24 * HOUR;
const SECOND_NUDGE_AFTER = 72 * HOUR;
/** Grace after the final nudge. Silence for a few hours is not a refusal. */
const GIVE_UP_AFTER_FINAL = 24 * HOUR;

function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  return Number.isNaN(then) ? null : now.getTime() - then;
}

export function selectNudge(lead: NudgeableLead, now: Date = new Date()): NudgeAction | null {
  if (lead.status !== 'greeted') return null;

  const sinceGreeting = hoursSince(lead.greeted_at, now);
  if (sinceGreeting === null) return null; // never actually greeted

  const sinceFinal = hoursSince(lead.nudge_72h_at, now);
  if (sinceFinal !== null) {
    return sinceFinal >= GIVE_UP_AFTER_FINAL ? 'give_up' : null;
  }

  const sinceFirst = hoursSince(lead.nudge_24h_at, now);
  if (sinceFirst !== null) {
    return sinceGreeting >= SECOND_NUDGE_AFTER ? 'nudge_72h' : null;
  }

  return sinceGreeting >= FIRST_NUDGE_AFTER ? 'nudge_24h' : null;
}
