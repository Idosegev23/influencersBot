/**
 * DM handler guards — atomic cross-invocation dedup + sender identity resolution.
 *
 * These sit in their own module so the decision logic is unit-testable without
 * pulling the whole DM handler (SandwichBot etc.) into the test.
 */

import { redisSetNx, isRedisAvailable, redisGet, redisSet } from '@/lib/redis';
import { getDmParticipantProfile } from './client';

export interface DmDedupDeps {
  setNx: (key: string, value: string, ttlSeconds: number) => Promise<boolean>;
  redisAvailable: () => boolean;
}

const defaultDedupDeps: DmDedupDeps = { setNx: redisSetNx, redisAvailable: isRedisAvailable };

/**
 * Claim an inbound message id so only ONE invocation processes it.
 *
 * Meta re-delivers webhooks (and delivers a DM via both messaging+changes), and
 * the DB `meta_mid` marker is only written AFTER the slow LLM+send — so duplicate
 * deliveries race past the SELECT dedup and produce two replies. A Redis SET NX is
 * atomic across concurrent serverless invocations: the winner proceeds, the rest skip.
 *
 * Returns true = proceed, false = duplicate (skip).
 * Fail-open: if Redis is unavailable we return true (the DB SELECT dedup is the
 * fallback) — never silence the bot just because Redis is down.
 */
export async function claimDmMessage(
  messageId: string | undefined,
  deps: DmDedupDeps = defaultDedupDeps,
): Promise<boolean> {
  if (!messageId || messageId.startsWith('postback_')) return true; // synthetic/no-mid → no dedup
  if (!deps.redisAvailable()) return true; // Redis down → don't block; DB dedup covers it
  return deps.setNx(`ig:dm:mid:${messageId}`, '1', 600); // 10-min claim window
}

/** Human-readable label for the person the bot is talking to, or null if unknown. */
export function formatContactLabel(
  contact: { name?: string | null; username?: string | null } | null | undefined,
): string | null {
  if (!contact) return null;
  const parts = [
    contact.name?.trim() || '',
    contact.username ? `@${contact.username.trim()}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/**
 * Resolve the DM sender's Instagram identity (name/username), cached in Redis for
 * 24h to avoid a Graph call on every message. Failsafe: returns null on any error
 * so the bot still replies (just without the name).
 */
export async function resolveSenderIdentity(
  senderId: string,
  accessToken?: string,
): Promise<{ name?: string; username?: string } | null> {
  const cacheKey = `ig:dm:profile:${senderId}`;
  try {
    const cached = await redisGet<{ name?: string; username?: string }>(cacheKey);
    if (cached) return cached;
  } catch {
    // ignore cache errors
  }
  try {
    const prof = await getDmParticipantProfile(senderId, accessToken);
    const identity = { name: prof?.name, username: prof?.username };
    if (identity.name || identity.username) {
      redisSet(cacheKey, identity, 86400).catch(() => {});
    }
    return identity;
  } catch {
    return null; // resolution is best-effort — never block the reply
  }
}
