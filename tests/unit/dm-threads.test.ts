import { describe, it, expect } from 'vitest';
import { parseRecipientFromThreadId, within24h, summarizeThreads } from '@/lib/instagram-graph/dm-threads';

const ACC = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

describe('parseRecipientFromThreadId', () => {
  it('extracts the numeric IGSID recipient', () => {
    expect(parseRecipientFromThreadId(`dm_ig_graph_1784140020801830_${ACC}`)).toBe('1784140020801830');
  });
  it('handles a recipient that itself contains digits/letters', () => {
    expect(parseRecipientFromThreadId(`dm_ig_graph_abc123_${ACC}`)).toBe('abc123');
  });
  it('returns null for non-Graph threads', () => {
    expect(parseRecipientFromThreadId('dm_respondio_123')).toBeNull();
    expect(parseRecipientFromThreadId('widget_x_y')).toBeNull();
    expect(parseRecipientFromThreadId('dm_ig_graph_123_not-a-uuid')).toBeNull();
  });
});

describe('within24h', () => {
  const now = Date.parse('2026-07-13T12:00:00Z');
  it('true just under 24h', () => {
    expect(within24h('2026-07-12T12:00:01Z', now)).toBe(true);
  });
  it('false at/over 24h', () => {
    expect(within24h('2026-07-12T12:00:00Z', now)).toBe(false);
    expect(within24h('2026-07-11T00:00:00Z', now)).toBe(false);
  });
  it('false for null/invalid', () => {
    expect(within24h(null, now)).toBe(false);
    expect(within24h('not-a-date', now)).toBe(false);
  });
});

describe('summarizeThreads', () => {
  it('counts conversations, bot vs human replies, and flagged', () => {
    const threads = [
      { flagged: true, messages: [
        { role: 'user' }, { role: 'assistant', by: 'bot' }, { role: 'assistant', by: 'human' },
      ] },
      { flagged: false, messages: [
        { role: 'user' }, { role: 'assistant', by: 'bot' },
      ] },
    ];
    expect(summarizeThreads(threads)).toEqual({ conversations: 2, botReplies: 2, humanReplies: 1, flagged: 1 });
  });
  it('treats assistant with no by as a bot reply', () => {
    expect(summarizeThreads([{ flagged: false, messages: [{ role: 'assistant' }] }]))
      .toEqual({ conversations: 1, botReplies: 1, humanReplies: 0, flagged: 0 });
  });
});
