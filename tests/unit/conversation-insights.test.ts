import { describe, it, expect, vi } from 'vitest';
import { generateInsights } from '@/lib/conversation-analytics/insights';
import { buildReport } from '@/lib/conversation-analytics/aggregate';

const baseRow = (o: any) => ({
  session_id: `s${Math.random()}`, channel: 'web', started_at: '2026-08-20T10:00:00Z',
  inquiry_type: 'other', topic_label: 'x', is_complaint: false,
  complaint_kind: null, sentiment: 'neutral', outcome: 'unknown',
  product_id: null, product_name: null, product_category: null, product_line: null,
  keywords: [], status: 'ok', ...o,
});

const report = buildReport({
  current: [
    {
      session_id: 's1', channel: 'web', started_at: '2026-08-20T10:00:00Z',
      inquiry_type: 'complaint', topic_label: 'בקבוק דלף', is_complaint: true,
      complaint_kind: 'defective', sentiment: 'negative', outcome: 'escalated',
      product_id: 'p1', product_name: 'שמפו', product_category: 'hair_care', product_line: 'סדרת קיק',
      keywords: ['דליפה'], status: 'ok',
    },
  ],
  previous: [],
  connectedChannels: ['web'],
});

describe('comparability guard', () => {
  // A real incident: mid-backfill the previous week had fewer classified rows
  // than the current one, and the generator confidently reported "conversation
  // volume rose from 155 to 434 — staff up". Nothing had risen. Volume deltas
  // are only meaningful when both periods are classified to a similar degree.
  it('tells the model when the two periods are not comparably classified', async () => {
    const { insightInput } = await import('@/lib/conversation-analytics/insights');
    const skewed = buildReport({
      current: Array.from({ length: 100 }, () => baseRow({})),
      previous: Array.from({ length: 10 }, () => baseRow({})),
      connectedChannels: ['web'],
      sessionsInRange: 100,
      previousSessionsInRange: 100,
    });
    expect(insightInput(skewed).coverageComparable).toBe(false);
  });

  it('marks comparable periods as comparable', async () => {
    const { insightInput } = await import('@/lib/conversation-analytics/insights');
    const even = buildReport({
      current: Array.from({ length: 95 }, () => baseRow({})),
      previous: Array.from({ length: 90 }, () => baseRow({})),
      connectedChannels: ['web'],
      sessionsInRange: 100,
      previousSessionsInRange: 100,
    });
    expect(insightInput(even).coverageComparable).toBe(true);
  });

  it('assumes comparable when the universe is unknown', async () => {
    const { insightInput } = await import('@/lib/conversation-analytics/insights');
    const unknown = buildReport({
      current: [baseRow({})], previous: [baseRow({})], connectedChannels: ['web'],
    });
    expect(insightInput(unknown).coverageComparable).toBe(true);
  });
});

describe('generateInsights', () => {
  it('keeps insights that carry evidence', async () => {
    const callModel = vi.fn(async () => ({
      insights: [{
        insight_type: 'complaint_cluster',
        title: 'בקבוקים דולפים',
        content: 'לקוחות מדווחים על בקבוקי שמפו דלופים',
        occurrence_count: 1,
        confidence: 0.9,
        evidence: ['שמפו: 1 תלונת פגם'],
      }],
    }));

    const out = await generateInsights(report, { callModel });
    expect(out).toHaveLength(1);
    expect(out[0].insight_type).toBe('complaint_cluster');
    expect(out[0].occurrence_count).toBe(1);
    expect(out[0].examples.length).toBeGreaterThan(0);
  });

  // An insight with no numbers behind it is an opinion. It does not ship.
  it('drops insights with no evidence and no count', async () => {
    const callModel = vi.fn(async () => ({
      insights: [
        { insight_type: 'rising_topic', title: 'תחושה כללית', content: 'נראה שיש מגמה', occurrence_count: 0, confidence: 0.8, evidence: ['x'] },
        { insight_type: 'rising_topic', title: 'ללא ראיה', content: 'משהו', occurrence_count: 5, confidence: 0.8, evidence: [] },
      ],
    }));

    const out = await generateInsights(report, { callModel });
    expect(out).toHaveLength(0);
  });

  it('coerces an unknown insight_type into the allowed set', async () => {
    const callModel = vi.fn(async () => ({
      insights: [{ insight_type: 'vibes', title: 't', content: 'c', occurrence_count: 3, confidence: 0.9, evidence: ['x'] }],
    }));
    const out = await generateInsights(report, { callModel });
    expect(out[0].insight_type).toBe('pain_point');
  });

  it('returns an empty list when the model fails rather than throwing', async () => {
    const callModel = vi.fn(async () => { throw new Error('500'); });
    await expect(generateInsights(report, { callModel })).resolves.toEqual([]);
  });

  it('sends aggregates, never raw conversation text', async () => {
    const callModel = vi.fn(async (_summary: any) => ({ insights: [] }));
    await generateInsights(report, { callModel });
    const payload = JSON.stringify(callModel.mock.calls[0][0]);
    expect(payload).not.toContain('s1');       // no session ids
    expect(payload).toContain('complaint');    // aggregates only
  });

  it('caps the list at six so the page stays readable', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      insight_type: 'rising_topic', title: `t${i}`, content: 'c',
      occurrence_count: 3, confidence: 0.9, evidence: ['x'],
    }));
    const out = await generateInsights(report, { callModel: vi.fn(async () => ({ insights: many })) });
    expect(out).toHaveLength(6);
  });
});
