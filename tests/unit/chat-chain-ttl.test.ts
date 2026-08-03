import { describe, it, expect } from 'vitest';
import {
  CHAIN_TTL_MS,
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
  it('is 30 minutes', () => {
    expect(CHAIN_TTL_MS).toBe(30 * MIN);
  });
});

describe('isChainStale', () => {
  it('is fresh for a turn seconds ago', () => {
    expect(isChainStale(ISO(5_000))).toBe(false);
  });

  it('is fresh just inside the window', () => {
    expect(isChainStale(ISO(29 * MIN))).toBe(false);
  });

  it('is stale just outside the window', () => {
    expect(isChainStale(ISO(31 * MIN))).toBe(true);
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

describe('resolvePreviousResponseId', () => {
  it('keeps the chain on an active session', () => {
    expect(resolvePreviousResponseId({ last_response_id: 'resp_abc', last_turn_at: ISO(2 * MIN) }))
      .toBe('resp_abc');
  });

  it('drops the chain once the session has gone idle', () => {
    expect(resolvePreviousResponseId({ last_response_id: 'resp_abc', last_turn_at: ISO(45 * MIN) }))
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
