import { describe, it, expect, vi } from 'vitest';
import { matchAlias, clusterTopics } from '@/lib/conversation-analytics/topics';

const TOPICS = [
  { id: 't1', label: 'נשירת שיער', aliases: ['שיער נושר', 'נשירה'] },
  { id: 't2', label: 'בעיית משלוח', aliases: [] },
];

describe('matchAlias', () => {
  it('matches the canonical label', () => {
    expect(matchAlias(TOPICS, 'נשירת שיער')).toBe('t1');
  });

  it('matches a known alias, whitespace-insensitively', () => {
    expect(matchAlias(TOPICS, '  שיער נושר ')).toBe('t1');
  });

  // The whole point of aliases: an already-seen phrasing costs zero tokens.
  it('returns null for an unseen phrasing so it goes to the model', () => {
    expect(matchAlias(TOPICS, 'התקרחות')).toBeNull();
    expect(matchAlias(TOPICS, '')).toBeNull();
  });
});

describe('clusterTopics', () => {
  it('assigns known phrasings without calling the model at all', async () => {
    const callModel = vi.fn();
    const assign = vi.fn(async () => {});
    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => TOPICS,
        fetchUnassignedRaw: async () => ['נשירת שיער', 'שיער נושר'],
        callModel,
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: assign,
      },
    });

    expect(callModel).not.toHaveBeenCalled();
    expect(res.matchedByAlias).toBe(2);
    expect(res.newTopics).toBe(0);
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it('sends only unseen phrasings to the model and records the merge as an alias', async () => {
    const callModel = vi.fn(async (_args: { existingLabels: string[]; rawTopics: string[] }) => ({
      assignments: [{ raw: 'התקרחות', label: 'נשירת שיער' }],
    }));
    const upsertTopic = vi.fn(async () => 't1');
    const assign = vi.fn(async () => {});

    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => TOPICS,
        fetchUnassignedRaw: async () => ['נשירת שיער', 'התקרחות'],
        callModel,
        upsertTopic,
        assignTopicToRaw: assign,
      },
    });

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(callModel.mock.calls[0][0].rawTopics).toEqual(['התקרחות']);
    expect(res.matchedByAlias).toBe(1);
    expect(res.clustered).toBe(1);
    expect(upsertTopic).toHaveBeenCalledWith('a1', 'נשירת שיער', 'התקרחות');
  });

  // Regression: one call for every topic overflowed max_output_tokens on the
  // first real run and came back as truncated JSON, losing the whole pass.
  it('splits a large topic set across several model calls', async () => {
    const many = Array.from({ length: 95 }, (_, i) => `נושא ${i}`);
    const callModel = vi.fn(async (a: { existingLabels: string[]; rawTopics: string[] }) => ({
      assignments: a.rawTopics.map((raw) => ({ raw, label: raw })),
    }));

    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => [],
        fetchUnassignedRaw: async () => many,
        callModel,
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: vi.fn(async () => {}),
      },
    });

    expect(callModel.mock.calls.length).toBeGreaterThan(1);
    for (const [args] of callModel.mock.calls) {
      expect(args.rawTopics.length).toBeLessThanOrEqual(40);
    }
    expect(res.clustered).toBe(95);
  });

  it('keeps the batches that worked when one batch fails', async () => {
    const many = Array.from({ length: 95 }, (_, i) => `נושא ${i}`);
    let call = 0;
    const callModel = vi.fn(async (a: { existingLabels: string[]; rawTopics: string[] }) => {
      call++;
      if (call === 2) throw new Error('Unterminated string in JSON');
      return { assignments: a.rawTopics.map((raw) => ({ raw, label: raw })) };
    });

    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => [],
        fetchUnassignedRaw: async () => many,
        callModel,
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: vi.fn(async () => {}),
      },
    });

    expect(res.clustered).toBeGreaterThan(0);
    expect(res.clustered).toBeLessThan(95);
  });

  it('offers earlier batches\' labels to later ones so clusters converge', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `נושא ${i}`);
    const callModel = vi.fn(async (a: { existingLabels: string[]; rawTopics: string[] }) => ({
      assignments: a.rawTopics.map((raw) => ({ raw, label: 'מאוחד' })),
    }));

    await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => [],
        fetchUnassignedRaw: async () => many,
        callModel,
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: vi.fn(async () => {}),
      },
    });

    expect(callModel.mock.calls[0][0].existingLabels).not.toContain('מאוחד');
    expect(callModel.mock.calls[1][0].existingLabels).toContain('מאוחד');
  });

  // Regression: 2,542 raw topics after the first retro meant 64 sequential
  // model calls in one request, which died as FUNCTION_INVOCATION_TIMEOUT.
  it('stops after its batch budget and reports what is left', async () => {
    const many = Array.from({ length: 500 }, (_, i) => `נושא ${i}`);
    const callModel = vi.fn(async (a: { existingLabels: string[]; rawTopics: string[] }) => ({
      assignments: a.rawTopics.map((raw) => ({ raw, label: raw })),
    }));

    const res = await clusterTopics({
      accountId: 'a1',
      maxBatches: 2,
      deps: {
        fetchTopics: async () => [],
        fetchUnassignedRaw: async () => many,
        callModel,
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: vi.fn(async () => {}),
      },
    });

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(res.clustered).toBe(80);
    expect(res.remaining).toBe(420);
  });

  it('reports nothing remaining once it fits inside the budget', async () => {
    const few = Array.from({ length: 10 }, (_, i) => `נושא ${i}`);
    const res = await clusterTopics({
      accountId: 'a1',
      maxBatches: 6,
      deps: {
        fetchTopics: async () => [],
        fetchUnassignedRaw: async () => few,
        callModel: vi.fn(async (a: any) => ({ assignments: a.rawTopics.map((raw: string) => ({ raw, label: raw })) })),
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: vi.fn(async () => {}),
      },
    });
    expect(res.remaining).toBe(0);
  });

  it('does nothing when there is nothing unassigned', async () => {
    const callModel = vi.fn();
    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => TOPICS,
        fetchUnassignedRaw: async () => [],
        callModel,
        upsertTopic: vi.fn(),
        assignTopicToRaw: vi.fn(),
      },
    });
    expect(callModel).not.toHaveBeenCalled();
    expect(res).toEqual({ matchedByAlias: 0, clustered: 0, newTopics: 0, remaining: 0 });
  });
});
