import { describe, it, expect, vi } from 'vitest';
import { channelOf, runClassification } from '@/lib/conversation-analytics/run-classification';

describe('channelOf', () => {
  it('reads the channel off the anon id prefix', () => {
    expect(channelOf('wa_972501234567_acc')).toBe('whatsapp');
    expect(channelOf('ig_17841400000000')).toBe('instagram');
    expect(channelOf('aw_wxjdyhrzmt18914r')).toBe('web');
    expect(channelOf('a_lmb12hfy97msx6171l')).toBe('web');
  });

  // 304 of Argania's last-30-day sessions have a null anon_id. They are real
  // conversations, so they must be classified — just not attributed to a channel.
  it('returns unknown rather than guessing for a null anon id', () => {
    expect(channelOf(null)).toBe('unknown');
    expect(channelOf('')).toBe('unknown');
  });
});

const session = (id: string) => ({
  id, accountId: 'a1', channel: 'web', startedAt: '2026-08-20T10:00:00.000Z',
  messages: [{ role: 'user', content: 'שאלה' }], intentHints: [],
});

function fakeDeps(sessions: any[], opts: { costPerRow?: number; classify?: any } = {}) {
  const inserted: any[] = [];
  const deps = {
    fetchPendingSessions: vi.fn(async () => sessions),
    fetchCatalog: vi.fn(async () => []),
    classify: vi.fn(async (s: any) => ({
      account_id: 'a1', session_id: s.id, channel: 'web',
      started_at: s.startedAt, user_message_count: 1,
      inquiry_type: 'other', topic_raw: 'x', is_complaint: false,
      complaint_kind: null, sentiment: 'neutral', urgency: 'normal',
      outcome: 'unknown', product_id: null, product_mention_raw: null,
      product_category: null, keywords: [], summary: 's', confidence: 0.9,
      status: 'ok' as const, error_message: null, model: 'gpt-5.6-luna',
      tokens_in: 100, tokens_out: 10, cost_usd: opts.costPerRow ?? 0.0002,
    })),
    saveRows: vi.fn(async (rows: any[]) => { inserted.push(...rows); return rows.length; }),
  };
  if (opts.classify) deps.classify = opts.classify;
  return { inserted, deps };
}

describe('runClassification', () => {
  it('classifies and saves every pending session', async () => {
    const { deps, inserted } = fakeDeps([session('s1'), session('s2')]);
    const res = await runClassification({ accountId: 'a1', deps });

    expect(res.classified).toBe(2);
    expect(res.failed).toBe(0);
    expect(inserted).toHaveLength(2);
  });

  it('does nothing and issues no model call when nothing is pending', async () => {
    const { deps } = fakeDeps([]);
    const res = await runClassification({ accountId: 'a1', deps });

    expect(res.classified).toBe(0);
    expect(deps.classify).not.toHaveBeenCalled();
    expect(deps.saveRows).not.toHaveBeenCalled();
  });

  // The $205 day was one uncapped chain. Every run carries a ceiling.
  it('stops at the budget ceiling and reports it', async () => {
    const many = Array.from({ length: 50 }, (_, i) => session(`s${i}`));
    const { deps, inserted } = fakeDeps(many, { costPerRow: 1 });
    const res = await runClassification({ accountId: 'a1', budgetUsd: 3, deps });

    expect(res.stoppedOnBudget).toBe(true);
    expect(res.classified).toBeLessThanOrEqual(3);
    expect(inserted.length).toBe(res.classified);
    expect(deps.classify.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('counts failed rows separately but still saves them for retry', async () => {
    const failing = vi.fn(async (s: any) => ({
      account_id: 'a1', session_id: s.id, channel: 'web',
      started_at: s.startedAt, user_message_count: 1,
      inquiry_type: null, topic_raw: null, is_complaint: false,
      complaint_kind: null, sentiment: null, urgency: null, outcome: null,
      product_id: null, product_mention_raw: null, product_category: null,
      keywords: [], summary: null, confidence: null,
      status: 'failed' as const, error_message: 'boom',
      model: null, tokens_in: null, tokens_out: null, cost_usd: null,
    }));
    const { deps, inserted } = fakeDeps([session('s1'), session('s2')], { classify: failing });

    const res = await runClassification({ accountId: 'a1', deps });
    expect(res.failed).toBe(2);
    expect(res.classified).toBe(0);
    expect(inserted).toHaveLength(2);
  });
});
