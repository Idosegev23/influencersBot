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
    expect(res).toEqual({ matchedByAlias: 0, clustered: 0, newTopics: 0 });
  });
});
