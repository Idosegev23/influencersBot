import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/email', () => ({ sendEmail: (...a: any[]) => sendEmail(...a) }));
vi.mock('googleapis', () => ({ google: {} }));

import { COST_REPORT_RECIPIENTS, runWeeklyCostReport, type RawCostData } from '@/lib/costs/weekly-report';

const emptyWeek = (): RawCostData => ({
  weekStart: '2026-08-30', weekEnd: '2026-09-05',
  accounts: [], scans: [], setups: [], apifyUsd: null, apifyCycleDays: null,
});
const busyWeek = (): RawCostData => ({
  ...emptyWeek(),
  accounts: [{
    accountId: 'a1', username: 'argania_group',
    week: { costUsd: 24, conversations: 200, turns: 480 },
    prevWeek: { costUsd: 20, conversations: 200 },
    allTime: { costUsd: 100, conversations: 1000, turns: 2400 },
  }],
});

beforeEach(() => vi.clearAllMocks());

describe('weekly cost report — who it reaches', () => {
  it('goes to the CTO, Yoav and Itamar', () => {
    expect(COST_REPORT_RECIPIENTS).toEqual(expect.arrayContaining([
      'cto@ldrsgroup.com', 'yoav@ldrsgroup.com', 'itamar@ldrsgroup.com',
    ]));
  });

  it('sends the report to all of them', async () => {
    await runWeeklyCostReport({ fetch: async () => busyWeek() });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toEqual(COST_REPORT_RECIPIENTS);
  });
});

/**
 * `conversation_analysis_runs` held zero rows for every account for months because its cron
 * selected a column that did not exist, and nothing watches cron exit codes. A silent week and
 * a broken cron look identical from the outside — unless the report arrives either way.
 */
describe('weekly cost report — it must never go quiet', () => {
  it('still sends on a week with no conversations at all', async () => {
    const res = await runWeeklyCostReport({ fetch: async () => emptyWeek() });
    expect(res.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].html).toContain('0 שיחות');
  });

  it('emails the same people when building the report throws, instead of dying silently', async () => {
    const res = await runWeeklyCostReport({ fetch: async () => { throw new Error('column does not exist'); } });
    expect(res.ok).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toEqual(COST_REPORT_RECIPIENTS);
    expect(`${mail.subject} ${mail.html}`).toContain('column does not exist');
  });

  it('does not swallow a send failure — it reports the send did not happen', async () => {
    sendEmail.mockRejectedValueOnce(new Error('gmail down'));
    const res = await runWeeklyCostReport({ fetch: async () => busyWeek() });
    expect(res.sent).toBe(false);
    expect(res.error).toContain('gmail down');
  });
});

describe('weekly cost report — dry run', () => {
  it('builds the report without sending when asked not to send', async () => {
    const res = await runWeeklyCostReport({ fetch: async () => busyWeek(), sendEmail: false });
    expect(sendEmail).not.toHaveBeenCalled();
    // paired presence check: the same call DOES send by default, so the assertion above is the
    // dry-run branch and not a send that never worked.
    expect(res.report!.week.usdPerConversation).toBeCloseTo(0.12, 6);
    await runWeeklyCostReport({ fetch: async () => busyWeek() });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
