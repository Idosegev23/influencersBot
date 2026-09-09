import { describe, it, expect } from 'vitest';
import {
  CHAIN_TTL_MS,
  MAX_CHAINED_TURNS,
  isChainStale,
  resolvePreviousResponseId,
} from '@/lib/chatbot/chain-ttl';

/**
 * Why this exists: `previous_response_id` makes OpenAI bill the ENTIRE accumulated
 * conversation as input on every turn, so a session's cost grows quadratically with turn
 * count. On 2026-07-25 one LA BEAUTÉ session ran 194 messages over 6 hours and drove
 * $205 of a $37/day average — 72% of it billed as `input, long context` because the
 * prompts crossed 128K tokens.
 *
 * A session that has been idle is almost always someone who left a tab open, not a
 * continuing thought. Dropping the chain there costs nothing (rolling_summary and
 * conversationHistory are sent separately) and caps the quadratic tail.
 */

const ISO = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;

describe('CHAIN_TTL_MS', () => {
  it('is 10 minutes', () => {
    expect(CHAIN_TTL_MS).toBe(10 * MIN);
  });
});

describe('isChainStale', () => {
  it('is fresh for a turn seconds ago', () => {
    expect(isChainStale(ISO(5_000))).toBe(false);
  });

  it('is fresh just inside the window', () => {
    expect(isChainStale(ISO(9 * MIN))).toBe(false);
  });

  it('is stale just outside the window', () => {
    expect(isChainStale(ISO(11 * MIN))).toBe(true);
  });

  it('is stale for the 6-hour session that caused the incident', () => {
    expect(isChainStale(ISO(6 * 60 * MIN))).toBe(true);
  });

  it('treats a missing timestamp as stale — legacy rows predate the column, and the safe\n     default is to drop the chain rather than bill an unbounded one', () => {
    expect(isChainStale(null)).toBe(true);
    expect(isChainStale(undefined)).toBe(true);
    expect(isChainStale('')).toBe(true);
  });

  it('treats an unparseable timestamp as stale', () => {
    expect(isChainStale('not-a-date')).toBe(true);
  });

  it('treats a future timestamp as fresh — clock skew must not force a needless reset', () => {
    expect(isChainStale(ISO(-60_000))).toBe(false);
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(isChainStale(new Date(Date.now() - 5_000))).toBe(false);
    expect(isChainStale(new Date(Date.now() - 40 * MIN))).toBe(true);
  });
});

/**
 * The idle TTL cannot catch the session that actually costs money. Measured over
 * 2026-08-03..09-08, the conversations that ran longest on one chain were RAPID: 21, 25 and
 * 28 turns with mean gaps of 0.6, 1.4 and 1.0 minutes and not one gap over ten. No idle
 * timeout touches those — and 28 turns is past the 128K threshold for argania_group, where
 * every further turn bills at double rate. The 2026-07-25 session was the same shape: 194
 * messages in 6 hours, a message every 1.9 minutes.
 *
 * So the chain is also capped by LENGTH. Past the cap the chain is simply not sent: each
 * turn costs what turn 1 costs, forever, and rolling_summary + conversationHistory carry
 * the context exactly as they do after an idle reset.
 */
describe('MAX_CHAINED_TURNS', () => {
  it('is 20 — under the earliest measured 128K crossing (turn 23, labeaute.israel)', () => {
    expect(MAX_CHAINED_TURNS).toBe(20);
  });
});

describe('resolvePreviousResponseId — the length cap', () => {
  // message_count is incremented by 2 per turn (one user + one assistant message).
  const turns = (n: number) => n * 2;

  it('drops the chain on a rapid-fire session that never went idle', () => {
    // The 28-turn conversation from the window: last turn one minute ago, never idle.
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      last_turn_at: ISO(1 * MIN),
      message_count: turns(28),
    })).toBeNull();
  });

  it('keeps the chain just under the cap', () => {
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      last_turn_at: ISO(1 * MIN),
      message_count: turns(19),
    })).toBe('resp_x');
  });

  it('drops it exactly at the cap', () => {
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      last_turn_at: ISO(1 * MIN),
      message_count: turns(20),
    })).toBeNull();
  });

  it('does not drop the chain for a session with no message_count', () => {
    // CS sessions are created with message_count 0 and never increment it; they do not chain
    // at all, so a missing counter must not be read as "very long".
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      last_turn_at: ISO(1 * MIN),
    })).toBe('resp_x');
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      last_turn_at: ISO(1 * MIN),
      message_count: 0,
    })).toBe('resp_x');
  });

  it('still drops an idle session that is well under the cap — both brakes apply', () => {
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      last_turn_at: ISO(11 * MIN),
      message_count: turns(3),
    })).toBeNull();
  });
});

describe('resolvePreviousResponseId', () => {
  it('keeps the chain on an active session', () => {
    expect(resolvePreviousResponseId({ last_response_id: 'resp_abc', last_turn_at: ISO(2 * MIN) }))
      .toBe('resp_abc');
  });

  it('drops the chain once the session has gone idle', () => {
    expect(resolvePreviousResponseId({ last_response_id: 'resp_abc', last_turn_at: ISO(15 * MIN) }))
      .toBeNull();
  });

  it('returns null when there is no chain to begin with', () => {
    expect(resolvePreviousResponseId({ last_response_id: null, last_turn_at: ISO(1 * MIN) })).toBeNull();
    expect(resolvePreviousResponseId(null)).toBeNull();
    expect(resolvePreviousResponseId(undefined)).toBeNull();
  });

  it('falls back to created_at when last_turn_at has not been written yet', () => {
    // Rows written before this feature shipped have no last_turn_at. created_at is the
    // only other trustworthy timestamp — updated_at/last_event_at are not maintained on
    // the turn path.
    expect(resolvePreviousResponseId({ last_response_id: 'resp_x', created_at: ISO(3 * MIN) }))
      .toBe('resp_x');
    expect(resolvePreviousResponseId({ last_response_id: 'resp_x', created_at: ISO(3 * 60 * MIN) }))
      .toBeNull();
  });

  it('prefers last_turn_at over created_at when both exist', () => {
    // A long-running but continuously active session must NOT be reset just because it
    // started hours ago.
    expect(resolvePreviousResponseId({
      last_response_id: 'resp_x',
      created_at: ISO(6 * 60 * MIN),
      last_turn_at: ISO(1 * MIN),
    })).toBe('resp_x');
  });

  it('drops the chain when neither timestamp is present', () => {
    expect(resolvePreviousResponseId({ last_response_id: 'resp_x' })).toBeNull();
  });
});
