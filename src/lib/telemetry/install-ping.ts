/**
 * Install-ping recorder.
 *
 * /api/widget/config receives the real Origin of every site embedding us and,
 * until now, threw it away. That header is the cheapest and most reliable proof
 * that a customer actually pasted the snippet — and unlike widget_events it does
 * not depend on ANALYTICS_WIDGET_SECRET being set, the env var whose absence
 * once caused a total widget-analytics blackout.
 */

import { redisSetNx, isRedisAvailable } from '@/lib/redis';
import { supabase } from '@/lib/supabase';

/** Scheme + lowercased host, or null when no usable origin exists. */
export function normalizeOrigin(
  originHeader: string | null,
  refererHeader: string | null,
): string | null {
  const candidate = originHeader && originHeader !== 'null' && originHeader !== '*'
    ? originHeader
    : refererHeader;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

function cleanPath(p: string | null): string | null {
  if (!p) return null;
  return p.split('?')[0].slice(0, 512);
}

export async function recordInstallPing(input: {
  accountId: string;
  origin: string | null;
  referer: string | null;
  path: string | null;
  widgetVersion: string | null;
}): Promise<'written' | 'deduped' | 'skipped'> {
  const origin = normalizeOrigin(input.origin, input.referer);
  if (!origin) return 'skipped';

  // One write per account+origin per minute. redisSetNx returns false BOTH when
  // the key exists AND when Redis is unavailable, so we must ask isRedisAvailable()
  // to tell those apart — otherwise a Redis outage silently disables install
  // detection. The upsert is idempotent on (account_id, origin, day), so writing
  // during an outage costs volume, never correctness.
  const minute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  const claimed = await redisSetNx(`wping:${input.accountId}:${origin}:${minute}`, '1', 60);
  if (!claimed && isRedisAvailable()) return 'deduped';

  try {
    const { error } = await supabase.rpc('upsert_install_ping', {
      p_account_id: input.accountId,
      p_origin: origin,
      p_widget_version: input.widgetVersion,
      p_sample_path: cleanPath(input.path),
    });
    if (error) {
      console.error('[install-ping] upsert failed:', error.message);
      return 'skipped';
    }
    return 'written';
  } catch (e: any) {
    console.error('[install-ping] upsert threw:', e?.message);
    return 'skipped';
  }
}
