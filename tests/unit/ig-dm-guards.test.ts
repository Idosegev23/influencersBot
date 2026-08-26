import { describe, it, expect } from 'vitest';
import { claimDmMessage, formatContactLabel, buildDmTurnRows } from '@/lib/instagram-graph/dm-guards';

describe('claimDmMessage (atomic double-reply dedup)', () => {
  it('proceeds for missing / postback mids without touching redis', async () => {
    const deps = { redisAvailable: () => true, setNx: async () => false };
    expect(await claimDmMessage(undefined, deps)).toBe(true);
    expect(await claimDmMessage('postback_123', deps)).toBe(true);
  });

  it('fails open (proceeds) when redis is unavailable — never silences the bot', async () => {
    const deps = { redisAvailable: () => false, setNx: async () => false };
    expect(await claimDmMessage('mid_1', deps)).toBe(true);
  });

  it('first delivery proceeds, duplicate delivery of the same mid is skipped', async () => {
    const store = new Set<string>();
    const deps = {
      redisAvailable: () => true,
      setNx: async (k: string) => {
        if (store.has(k)) return false; // already claimed
        store.add(k);
        return true;
      },
    };
    expect(await claimDmMessage('mid_2', deps)).toBe(true); // winner
    expect(await claimDmMessage('mid_2', deps)).toBe(false); // duplicate → skip
    expect(await claimDmMessage('mid_3', deps)).toBe(true); // different mid → proceed
  });
});

describe('formatContactLabel (sender identity)', () => {
  it('combines name and @username', () => {
    expect(formatContactLabel({ name: 'Dana Levi', username: 'dana_ig' })).toBe('Dana Levi @dana_ig');
  });
  it('handles username-only and name-only', () => {
    expect(formatContactLabel({ username: 'brandx' })).toBe('@brandx');
    expect(formatContactLabel({ name: 'Some Brand' })).toBe('Some Brand');
  });
  it('returns null when nothing usable', () => {
    expect(formatContactLabel({})).toBeNull();
    expect(formatContactLabel(null)).toBeNull();
    expect(formatContactLabel({ name: '  ', username: '' })).toBeNull();
  });
});

/**
 * Regression: the DM handler inserted the user row and the assistant row with a
 * single `Promise.all`, both relying on `created_at`'s default now(). Whichever
 * statement reached Postgres first won the earlier timestamp, so the bot's reply
 * was routinely stored BEFORE the message it answered — 20 of the 33 ldrs_group
 * DM threads open with an assistant row.
 *
 * That is not only a display bug: history is loaded `order by created_at`, so
 * every prior exchange was fed back to the model inverted.
 */
describe('buildDmTurnRows (user is always stored before the reply)', () => {
  const received = Date.parse('2026-08-20T10:48:20.000Z');
  const completed = Date.parse('2026-08-20T10:48:26.500Z');

  it('stamps the user row with when the DM arrived, not when the reply finished', () => {
    const { userRow, assistantRow } = buildDmTurnRows({
      sessionId: 'sess-1',
      messageText: 'פז טוויק - 0526894662',
      messageId: 'mid_abc',
      replyText: 'תודה פז, קיבלנו 🤍',
      receivedAtMs: received,
      completedAtMs: completed,
    });

    expect(userRow.created_at).toBe('2026-08-20T10:48:20.000Z');
    expect(Date.parse(userRow.created_at)).toBeLessThan(Date.parse(assistantRow.created_at));
    expect(assistantRow.created_at).toBe('2026-08-20T10:48:26.500Z');
  });

  it('holds even when the model answers within the same millisecond', () => {
    const { userRow, assistantRow } = buildDmTurnRows({
      sessionId: 'sess-1',
      messageText: 'היי',
      replyText: 'הייי ✨',
      receivedAtMs: received,
      completedAtMs: received, // clock granularity / cached reply
    });
    expect(Date.parse(userRow.created_at)).toBeLessThan(Date.parse(assistantRow.created_at));
  });

  it('carries the content, the session and the dedup marker through unchanged', () => {
    const { userRow, assistantRow } = buildDmTurnRows({
      sessionId: 'sess-1',
      messageText: 'היי',
      messageId: 'mid_abc',
      replyText: 'הייי ✨',
      receivedAtMs: received,
      completedAtMs: completed,
    });
    expect(userRow).toMatchObject({ session_id: 'sess-1', role: 'user', content: 'היי', meta_mid: 'mid_abc' });
    expect(assistantRow).toMatchObject({ session_id: 'sess-1', role: 'assistant', content: 'הייי ✨' });
    expect(assistantRow.metadata.latency_ms).toBe(6500);
  });

  it('omits meta_mid entirely when there is no message id (postbacks)', () => {
    const { userRow } = buildDmTurnRows({
      sessionId: 'sess-1',
      messageText: 'קופון',
      replyText: '...',
      receivedAtMs: received,
      completedAtMs: completed,
    });
    expect('meta_mid' in userRow).toBe(false);
  });
});
