/**
 * /chat is the one partner route that costs money per call, so it gets real
 * limits backed by Redis. The shared limiter falls back to per-instance memory
 * when Redis is down; for a paid model call that is not a limit at all, so
 * here an unavailable Redis refuses the turn.
 */
import crypto from 'node:crypto';
import { redisSlidingWindowRateLimit, isRedisAvailable } from '@/lib/redis';

export const MAX_MESSAGE_CHARS = 2000;
const WINDOW_MS = 60_000;
const ANON_LIMIT = 20;
const ACCOUNT_LIMIT = 300;

export type ChatLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; error: 'rate_limited' | 'rate_limiter_unavailable'; retryAfterMs: number };

const UNAVAILABLE: ChatLimitResult = { allowed: false, status: 503, error: 'rate_limiter_unavailable', retryAfterMs: 5000 };

export async function checkChatLimits(
  ctx: { accountId: string; anonId: string },
  deps: { limiter?: typeof redisSlidingWindowRateLimit; available?: () => boolean } = {},
): Promise<ChatLimitResult> {
  const limiter = deps.limiter ?? redisSlidingWindowRateLimit;
  const available = deps.available ?? isRedisAvailable;
  if (!available()) return UNAVAILABLE;

  // Anon is checked first on purpose: a single flooder is refused before it can
  // drain the association bucket that every visitor of the association shares.
  const buckets = [
    { key: `rl:copilot:chat:anon:${ctx.accountId}:${ctx.anonId}`, limit: ANON_LIMIT },
    { key: `rl:copilot:chat:account:${ctx.accountId}`, limit: ACCOUNT_LIMIT },
  ];
  for (const b of buckets) {
    const r = await limiter({ key: b.key, limit: b.limit, windowMs: WINDOW_MS, identifier: crypto.randomUUID() });
    if (!r) return UNAVAILABLE;
    if (!r.allowed) {
      // The shared helper can return a non-finite retryAfterMs on refusal; fall back to the window.
      const retryAfterMs = Number.isFinite(r.retryAfterMs) && r.retryAfterMs > 0 ? r.retryAfterMs : WINDOW_MS;
      return { allowed: false, status: 429, error: 'rate_limited', retryAfterMs };
    }
  }
  return { allowed: true };
}
