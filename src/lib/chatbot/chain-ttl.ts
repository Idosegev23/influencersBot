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
 *
 * There are TWO brakes, because idleness alone does not catch the sessions that cost money.
 * Measured over 2026-08-03..09-08, the conversations that ran longest on a single chain were
 * rapid rather than long-lived — 21, 25 and 28 turns with mean gaps of 0.6, 1.4 and 1.0
 * minutes and not one gap over ten. No idle timeout of any length touches those, and 28 turns
 * is already past the 128K threshold for argania_group. The 2026-07-25 session had the same
 * shape: a message every 1.9 minutes for six hours. So the chain is capped by LENGTH as well
 * as by idleness.
 */

/** How long a session may sit idle before its chain is abandoned. */
export const CHAIN_TTL_MS = 10 * 60 * 1000;

/**
 * How many turns a single chain may accumulate before it is abandoned.
 *
 * Each turn re-sends the whole RAG block into the chain (baseArchetype pushes `userPrompt`,
 * which begins with kbContext, as a user message every turn), so the chain grows by 3.4K–5.1K
 * tokens per turn depending on the account. Measured crossings of the 128K long-context
 * threshold — where BOTH input and output rates double — are turn 23 (labeaute.israel),
 * 28 (argania_group) and 37 (studiopasha_fashion). Twenty sits under the earliest of those
 * with margin, and touches 0.14% of conversations: p99 is 12 turns.
 *
 * Past the cap the chain is simply not sent, so every further turn costs what turn 1 costs.
 */
export const MAX_CHAINED_TURNS = 20;

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
 * active and short, `null` once it has gone idle OR grown past the turn cap.
 *
 * `last_turn_at` wins over `created_at` for the idle check, so a continuously active session
 * is not reset merely because it started hours ago — that is what the turn cap is for.
 * `created_at` is the fallback for rows written before this shipped; `updated_at` and
 * `last_event_at` are deliberately NOT consulted — neither is maintained on the turn path.
 *
 * `message_count` counts messages, two per turn. It is only ever an UNDER-count (measured:
 * 90% exact, never over, and 98.3% accurate across the 10+-turn conversations this cap is
 * for), so the cap can fire a shade late but never early. A missing or zero counter is not
 * read as "very long": CS sessions are created with 0 and never increment it, and they do
 * not chain at all.
 */
export function resolvePreviousResponseId(
  session:
    | {
        last_response_id?: string | null;
        last_turn_at?: Timestamp;
        created_at?: Timestamp;
        message_count?: number | null;
      }
    | null
    | undefined
): string | null {
  const chain = session?.last_response_id;
  if (!chain) return null;

  const turns = Math.floor((session?.message_count ?? 0) / 2);
  if (turns >= MAX_CHAINED_TURNS) return null;

  const lastActivity = session?.last_turn_at ?? session?.created_at;
  return isChainStale(lastActivity) ? null : chain;
}
