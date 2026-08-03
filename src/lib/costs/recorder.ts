/**
 * Per-turn cost accounting and budget alerting.
 *
 * Background: `cost_tracking` and its `increment_cost` RPC have existed since migration
 * 004 and were never called, so the table was permanently empty and both of its readers
 * silently fell back to defaults. Meanwhile OpenAI's `usage` was parsed in baseArchetype,
 * logged, and dropped. The 2026-07-25 $205 day — one chained conversation billing its
 * whole history on every turn — went unnoticed for a week.
 *
 * This closes the loop: every model turn is priced, accumulated, and checked against three
 * thresholds. Everything here is best-effort and never throws: a chat turn must not fail
 * because accounting did.
 */

import { estimateCostUsd } from './pricing';
import type { TokenUsage } from '@/lib/chatbot/archetypes/types';

/** A single conversation this expensive is almost certainly a runaway context chain. */
export const SESSION_ALERT_USD = 5;
/** One brand burning this much in a day warrants a look. */
export const ACCOUNT_DAILY_ALERT_USD = 20;
/** Org-wide daily ceiling. Normal days run $21–37; 25 July hit $205. */
export const ORG_DAILY_ALERT_USD = 80;

/** Alerts repeat at most once an hour per key, so a bad day sends a handful of emails. */
const ALERT_COOLDOWN_SECONDS = 3600;
/** Session totals outlive a long conversation but not the day. */
const SESSION_TOTAL_TTL_SECONDS = 24 * 3600;

const USD_TO_MICROS = 1e6;
const micros = (usd: number) => Math.round(usd * USD_TO_MICROS);
const usd = (m: number) => m / USD_TO_MICROS;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function shouldAlert(key: string): Promise<boolean> {
  try {
    const { isRedisAvailable, redisGet } = await import('@/lib/redis');
    if (!isRedisAvailable()) return true; // no Redis = always send, better loud than silent
    return !(await redisGet<number>(`alert:cooldown:${key}`));
  } catch {
    return true;
  }
}

async function markAlerted(key: string): Promise<void> {
  try {
    const { isRedisAvailable, redisSet } = await import('@/lib/redis');
    if (isRedisAvailable()) await redisSet(`alert:cooldown:${key}`, Date.now(), ALERT_COOLDOWN_SECONDS);
  } catch {
    /* cooldown is an optimisation, not a correctness requirement */
  }
}

async function alert(key: string, level: 'warning' | 'critical', subject: string, message: string): Promise<void> {
  try {
    if (!(await shouldAlert(key))) return;
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({ level, subject, message });
    await markAlerted(key);
  } catch (err) {
    console.error('[cost] alert failed:', err);
  }
}

/**
 * Price one model turn, accumulate it, and alert if any threshold is crossed.
 *
 * Call it fire-and-forget from the turn path. Never throws.
 */
export async function recordTurnCost(params: {
  accountId: string;
  sessionId?: string | null;
  usage: TokenUsage | null | undefined;
}): Promise<void> {
  try {
    const { accountId, sessionId, usage } = params;
    if (!accountId || !usage) return;

    const cost = estimateCostUsd({
      model: usage.model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    });
    const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
    if (cost <= 0 && totalTokens <= 0) return; // unknown model or empty turn — no fabricated row

    // --- 1. Durable per-account daily total (the RPC returns the running total) ---
    let accountDailyUsd: number | null = null;
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const { data } = await supabase.rpc('increment_cost', {
        p_account_id: accountId,
        p_period_type: 'day',
        p_tokens: totalTokens,
        p_cost: cost,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.new_cost != null) accountDailyUsd = parseFloat(String(row.new_cost));
    } catch (err) {
      console.error('[cost] increment_cost failed:', err);
    }

    // --- 2. Fast counters in Redis for the session and org-wide totals ---
    let sessionUsd: number | null = null;
    let orgDailyUsd: number | null = null;
    try {
      const { isRedisAvailable, redisIncrBy, redisExpire } = await import('@/lib/redis');
      if (isRedisAvailable()) {
        const delta = micros(cost);
        const day = todayKey();
        if (sessionId) {
          const key = `cost:session:${sessionId}`;
          const t = await redisIncrBy(key, delta);
          if (t != null) sessionUsd = usd(t);
          await redisExpire(key, SESSION_TOTAL_TTL_SECONDS);
        }
        const orgKey = `cost:org:${day}`;
        const o = await redisIncrBy(orgKey, delta);
        if (o != null) orgDailyUsd = usd(o);
        await redisExpire(orgKey, SESSION_TOTAL_TTL_SECONDS);
      }
    } catch (err) {
      console.error('[cost] redis counters failed:', err);
    }

    // --- 3. Thresholds, cheapest-to-detect first ---
    if (sessionId && sessionUsd != null && sessionUsd > SESSION_ALERT_USD) {
      await alert(
        `cost-session:${sessionId}`,
        'warning',
        `שיחה יחידה חצתה $${SESSION_ALERT_USD}`,
        `שיחה ${sessionId} (חשבון ${accountId}) הגיעה ל-$${sessionUsd.toFixed(2)}.\n\n` +
          `שיחה בעלות כזו היא כמעט תמיד שרשור הקשר שרץ בלי בלם — כל תור מחויב מחדש על כל ההיסטוריה. ` +
          `כדאי לבדוק את מספר התורים בשיחה ואת גודל הקלט בכל תור.`
      );
    }

    if (accountDailyUsd != null && accountDailyUsd > ACCOUNT_DAILY_ALERT_USD) {
      await alert(
        `cost-account:${accountId}:${todayKey()}`,
        'warning',
        `חשבון חצה $${ACCOUNT_DAILY_ALERT_USD} ביום`,
        `חשבון ${accountId} הגיע ל-$${accountDailyUsd.toFixed(2)} מתחילת היום.`
      );
    }

    if (orgDailyUsd != null && orgDailyUsd > ORG_DAILY_ALERT_USD) {
      await alert(
        `cost-org:${todayKey()}`,
        'critical',
        `סך העלות היומי חצה $${ORG_DAILY_ALERT_USD}`,
        `סך עלות המודלים היום הגיעה ל-$${orgDailyUsd.toFixed(2)}.\n\n` +
          `יום רגיל נע סביב $21–37. כדאי לבדוק ב-platform.openai.com → Usage מה מוביל.`
      );
    }
  } catch (err) {
    // Accounting must never break a chat turn.
    console.error('[cost] recordTurnCost failed:', err);
  }
}
