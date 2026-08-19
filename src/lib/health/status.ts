/**
 * Channel health status derivation. Pure — no I/O — so every transition can be
 * table-tested. A subtle mistake here silently misinforms every decision made
 * from the health board.
 */

export type ChannelStatus = 'never_installed' | 'silent' | 'erroring' | 'dormant' | 'live';

export interface ChannelFacts {
  everPinged: boolean;
  hoursSinceLastPing: number | null;
  opensLast7d: number;
  errorsLast24h: number;
  loadsLast24h: number;
}

/**
 * Note: no `liveHours` or `dormantDays` here. The 24-hour and 7-day windows
 * are baked into the fact names themselves (`loadsLast24h`, `opensLast7d`) —
 * they are defined by the fact producer (the SQL that computes those facts),
 * not by this function. Do not re-add them as dead knobs.
 */
export interface StatusThresholds {
  silentDays: number;
  errorCount: number;
  errorRatio: number;
}

export const DEFAULT_THRESHOLDS: StatusThresholds = {
  silentDays: 3,
  errorCount: 20,
  errorRatio: 0.05,
};

/**
 * Precedence — first match wins:
 *   never_installed → silent → erroring → dormant → live
 *
 * Absence beats brokenness: there is nothing to fix if it was never installed.
 * Brokenness beats disuse: `erroring` is very often the CAUSE of `dormant`
 * (a widget that throws on open records loads but no opens), and reporting the
 * symptom would hide the reason.
 */
export function deriveChannelStatus(
  facts: ChannelFacts,
  t: StatusThresholds = DEFAULT_THRESHOLDS,
): ChannelStatus {
  if (!facts.everPinged) return 'never_installed';

  const hours = facts.hoursSinceLastPing;
  // everPinged with an unknown last-ping time means the ping is older than our
  // lookback window — that is silence, not health.
  if (hours === null || hours > t.silentDays * 24) return 'silent';

  const ratio = facts.loadsLast24h > 0 ? facts.errorsLast24h / facts.loadsLast24h : 0;
  if (facts.errorsLast24h >= t.errorCount && ratio >= t.errorRatio) return 'erroring';

  if (facts.opensLast7d === 0) return 'dormant';

  return 'live';
}
