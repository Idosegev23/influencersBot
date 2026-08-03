/**
 * Idle-timeout for the OpenAI `previous_response_id` conversation chain.
 *
 * Chaining hands context management to OpenAI: the server keeps the prior turns and bills
 * the ENTIRE accumulated conversation as input on every subsequent turn. Cost therefore
 * grows quadratically with turn count — turn 97 pays for the 96 turns before it.
 *
 * On 2026-07-25 a single LA BEAUTÉ session (194 messages over 6 hours) drove $205 against
 * a $37/day average, 72% of it billed as `input, long context` because the prompts crossed
 * gpt-5.4's 128K threshold. Nothing in the codebase ever cleared the chain.
 *
 * An idle session is nearly always an abandoned tab rather than a paused thought, so
 * dropping the chain there loses nothing the model still needs: `rolling_summary` and
 * `conversationHistory` are passed separately on every turn and carry the context forward.
 */

/** How long a session may sit idle before its chain is abandoned. */
export const CHAIN_TTL_MS = 30 * 60 * 1000;

type Timestamp = string | Date | null | undefined;

function toMillis(ts: Timestamp): number | null {
  if (!ts) return null;
  const ms = ts instanceof Date ? ts.getTime() : Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * True when the last turn is older than the TTL.
 *
 * Missing or unparseable timestamps count as stale: legacy rows predate `last_turn_at`,
 * and the safe default is to start a fresh chain rather than extend an unbounded one.
 * A future timestamp (clock skew) counts as fresh — skew must not force a needless reset.
 */
export function isChainStale(lastTurnAt: Timestamp): boolean {
  const ms = toMillis(lastTurnAt);
  if (ms === null) return true;
  return Date.now() - ms > CHAIN_TTL_MS;
}

/**
 * The `previous_response_id` to send for this turn — the stored one while the session is
 * active, `null` once it has gone idle.
 *
 * `last_turn_at` wins over `created_at` so a long but continuously active session is never
 * reset merely because it started hours ago. `created_at` is the fallback for rows written
 * before this shipped; `updated_at` and `last_event_at` are deliberately NOT consulted —
 * neither is maintained on the chat-turn path.
 */
export function resolvePreviousResponseId(
  session:
    | { last_response_id?: string | null; last_turn_at?: Timestamp; created_at?: Timestamp }
    | null
    | undefined
): string | null {
  const chain = session?.last_response_id;
  if (!chain) return null;
  const lastActivity = session?.last_turn_at ?? session?.created_at;
  return isChainStale(lastActivity) ? null : chain;
}
