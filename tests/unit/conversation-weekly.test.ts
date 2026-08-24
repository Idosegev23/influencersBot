import { describe, it, expect, vi } from 'vitest';
import { lastFullWeek, runWeeklyReport } from '@/lib/conversation-analytics/weekly';

describe('lastFullWeek', () => {
  // Sunday 2026-08-23 → the closed week is Sun 16 Aug through Sat 22 Aug.
  it('returns the previous Sunday-to-Saturday window', () => {
    const w = lastFullWeek(new Date('2026-08-23T06:00:00.000Z'));
    expect(w.startIso.slice(0, 10)).toBe('2026-08-16');
    expect(w.endIso.slice(0, 10)).toBe('2026-08-23');
    expect(w.prevStartIso.slice(0, 10)).toBe('2026-08-09');
    expect(w.prevEndIso.slice(0, 10)).toBe('2026-08-16');
  });

  // Mid-week the closed week is still the one that ended on the last Sunday.
  it('does not include the running week', () => {
    const w = lastFullWeek(new Date('2026-08-20T06:00:00.000Z')); // a Thursday
    expect(w.startIso.slice(0, 10)).toBe('2026-08-09');
    expect(w.endIso.slice(0, 10)).toBe('2026-08-16');
  });

  it('gives the comparison window the same length as the reported one', () => {
    const w = lastFullWeek(new Date('2026-08-23T06:00:00.000Z'));
    const len = (a: string, b: string) => Date.parse(b) - Date.parse(a);
    expect(len(w.startIso, w.endIso)).toBe(len(w.prevStartIso, w.prevEndIso));
  });
});

const rows = [{
  session_id: 's1', channel: 'web', started_at: '2026-08-18T10:00:00Z',
  inquiry_type: 'complaint', topic_label: 'דליפה', is_complaint: true,
  complaint_kind: 'defective', sentiment: 'negative', outcome: 'escalated',
  product_id: 'p1', product_name: 'שמפו', product_category: 'hair_care', product_line: 'סדרת קיק',
  keywords: ['דליפה'], status: 'ok',
}];

function deps(over: any = {}) {
  return {
    fetchRows: vi.fn(async (_a: string, _f: string, _t: string) => rows),
    fetchPreviousRows: vi.fn(async (_a: string, _f: string, _t: string) => [] as typeof rows),
    fetchConnectedChannels: vi.fn(async (_a: string) => ['web']),
    generate: vi.fn(async (_r: any) => ([{
      insight_type: 'complaint_cluster', title: 't', content: 'c',
      occurrence_count: 1, confidence_score: 0.9, examples: ['x'], tags: [],
    }])),
    saveSnapshot: vi.fn(async (_a: string, _s: string, _e: string, _p: any) => {}),
    saveInsights: vi.fn(async (_a: string, _i: any[]) => {}),
    sendEmail: vi.fn(async (_p: any, _a: string) => true),
    ...over,
  };
}

describe('runWeeklyReport', () => {
  it('freezes a snapshot, persists insights and emails once', async () => {
    const d = deps();
    const res = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });

    expect(res.total).toBe(1);
    expect(res.insights).toBe(1);
    expect(res.emailed).toBe(true);
    expect(d.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(d.saveInsights).toHaveBeenCalledTimes(1);
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
  });

  // The pushed email must not carry conversation bodies (spec §6.3).
  it('emails aggregates only — no session ids', async () => {
    const d = deps();
    await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });
    const payload = JSON.stringify(d.sendEmail.mock.calls[0][0]);
    expect(payload).not.toContain('s1');
  });

  it('writes a snapshot but sends nothing for an empty week', async () => {
    const d = deps({ fetchRows: vi.fn(async (_a: string, _f: string, _t: string) => []) });
    const res = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });

    expect(res.total).toBe(0);
    expect(res.emailed).toBe(false);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(d.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('still writes the snapshot when insight generation returns nothing', async () => {
    const d = deps({ generate: vi.fn(async (_r: any) => []) });
    const res = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });
    expect(res.insights).toBe(0);
    expect(d.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('re-running the same week overwrites rather than duplicating', async () => {
    const d = deps();
    const a = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });
    const b = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T09:00:00Z'), deps: d });
    expect(a.periodStart).toBe(b.periodStart);
    expect(a.periodEnd).toBe(b.periodEnd);
  });
});
