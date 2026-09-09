import { describe, it, expect } from 'vitest';
import {
  aggregateWeeklyCost,
  weekRangeFor,
  type RawCostData,
  type AccountCostInput,
} from '@/lib/costs/weekly-report';

/**
 * The report exists because the per-conversation cost is the number the team prices on, and
 * nobody was watching it move. Everything here is arithmetic over already-aggregated rows —
 * the DB read lives in fetchRawCostData, so the parts that actually get a decision wrong
 * (a division by zero, a delta sign, a ranking) are testable without a database.
 */

const acct = (o: Partial<AccountCostInput> & { username: string }): AccountCostInput => ({
  accountId: `id-${o.username}`,
  username: o.username,
  week: { costUsd: 0, conversations: 0, turns: 0 },
  prevWeek: { costUsd: 0, conversations: 0 },
  allTime: { costUsd: 0, conversations: 0, turns: 0 },
  ...o,
});

const raw = (over: Partial<RawCostData> = {}): RawCostData => ({
  weekStart: '2026-08-30',
  weekEnd: '2026-09-05',
  accounts: [],
  scans: [],
  setups: [],
  apifyUsd: null,
  apifyCycleDays: null,
  ...over,
});

describe('weekRangeFor', () => {
  it('covers the seven days that ended the day before the Sunday it runs', () => {
    // Cron fires Sunday 2026-09-06 08:00 IL; the week it reports is Sun 08-30 .. Sat 09-05.
    const { weekStart, weekEnd } = weekRangeFor(new Date('2026-09-06T05:00:00Z'));
    expect(weekStart).toBe('2026-08-30');
    expect(weekEnd).toBe('2026-09-05');
  });
});

describe('aggregateWeeklyCost — the headline numbers', () => {
  it('totals the week and divides cost by conversations', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [
        acct({ username: 'argania', week: { costUsd: 30, conversations: 300, turns: 700 } }),
        acct({ username: 'labeaute', week: { costUsd: 20, conversations: 100, turns: 260 } }),
      ],
    }));
    expect(r.week.costUsd).toBeCloseTo(50, 6);
    expect(r.week.conversations).toBe(400);
    expect(r.week.turns).toBe(960);
    expect(r.week.usdPerConversation).toBeCloseTo(0.125, 6);
    expect(r.week.usdPerTurn).toBeCloseTo(50 / 960, 6);
  });

  it('reports a zero-conversation week instead of dividing by it', () => {
    const quiet = aggregateWeeklyCost(raw({ accounts: [acct({ username: 'argania' })] }));
    expect(quiet.week.conversations).toBe(0);
    expect(quiet.week.usdPerConversation).toBeNull();
    expect(Number.isFinite(quiet.week.costUsd)).toBe(true);
    // paired presence check — the same shape DOES produce an average when the week has traffic,
    // so the null above is the zero-week branch and not a field that is always null.
    const busy = aggregateWeeklyCost(raw({
      accounts: [acct({ username: 'argania', week: { costUsd: 10, conversations: 100, turns: 200 } })],
    }));
    expect(busy.week.usdPerConversation).toBeCloseTo(0.1, 6);
  });
});

describe('aggregateWeeklyCost — this week against the running average', () => {
  it('marks a week that costs more per conversation than the all-time average', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [acct({
        username: 'argania',
        week: { costUsd: 24, conversations: 200, turns: 400 },      // $0.12
        allTime: { costUsd: 100, conversations: 1000, turns: 2000 }, // $0.10
      })],
    }));
    expect(r.allTime.usdPerConversation).toBeCloseTo(0.1, 6);
    expect(r.week.usdPerConversation).toBeCloseTo(0.12, 6);
    expect(r.comparison.direction).toBe('up');
    expect(r.comparison.deltaPct).toBeCloseTo(20, 4);
  });

  it('marks a cheaper week as down', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [acct({
        username: 'argania',
        week: { costUsd: 8, conversations: 100, turns: 200 },
        allTime: { costUsd: 100, conversations: 1000, turns: 2000 },
      })],
    }));
    expect(r.comparison.direction).toBe('down');
    expect(r.comparison.deltaPct).toBeCloseTo(-20, 4);
  });

  it('has no direction to report when the week had no conversations', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [acct({ username: 'argania', allTime: { costUsd: 100, conversations: 1000, turns: 2000 } })],
    }));
    expect(r.comparison.direction).toBe('unknown');
    expect(r.comparison.deltaPct).toBeNull();
  });
});

describe('aggregateWeeklyCost — per account', () => {
  it('ranks the most expensive account first and gives each its own per-conversation cost', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [
        acct({ username: 'small', week: { costUsd: 2, conversations: 40, turns: 80 } }),
        acct({ username: 'big', week: { costUsd: 30, conversations: 200, turns: 500 } }),
        acct({ username: 'mid', week: { costUsd: 9, conversations: 50, turns: 120 } }),
      ],
    }));
    expect(r.accounts.map((a) => a.username)).toEqual(['big', 'mid', 'small']);
    expect(r.accounts[0].usdPerConversation).toBeCloseTo(0.15, 6);
    expect(r.accounts[1].usdPerConversation).toBeCloseTo(0.18, 6);
  });

  it('does not report a per-conversation cost for an account that was billed with no conversations', () => {
    // Real shape: spend with no conversation behind it is the thing worth seeing, so the row
    // must survive — reporting Infinity, or dropping it, both hide it.
    const r = aggregateWeeklyCost(raw({
      accounts: [acct({ username: 'ghost', week: { costUsd: 4, conversations: 0, turns: 0 } })],
    }));
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0].costUsd).toBeCloseTo(4, 6);
    expect(r.accounts[0].usdPerConversation).toBeNull();
  });

  it('shows each account against its own previous week', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [acct({
        username: 'argania',
        week: { costUsd: 24, conversations: 200, turns: 400 },   // $0.12
        prevWeek: { costUsd: 20, conversations: 200 },            // $0.10
      })],
    }));
    expect(r.accounts[0].prevUsdPerConversation).toBeCloseTo(0.1, 6);
    expect(r.accounts[0].deltaPct).toBeCloseTo(20, 4);
  });

  it('leaves the delta empty for an account that had no previous week', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [acct({ username: 'new', week: { costUsd: 5, conversations: 50, turns: 90 } })],
    }));
    expect(r.accounts[0].prevUsdPerConversation).toBeNull();
    expect(r.accounts[0].deltaPct).toBeNull();
  });

  it('leaves out an account that neither spent nor talked this week', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [
        acct({ username: 'active', week: { costUsd: 5, conversations: 50, turns: 90 } }),
        acct({ username: 'dormant' }),
      ],
    }));
    expect(r.accounts.map((a) => a.username)).toEqual(['active']);
  });
});

describe('aggregateWeeklyCost — the daily scan', () => {
  const scans = [
    { username: 'argania', runs: 7, failedRuns: 0, postsFetched: 350, newPosts: 3 },
    { username: 'account-mxiwa_', runs: 7, failedRuns: 7, postsFetched: 0, newPosts: 0 },
  ];

  it('totals the runs and shows what the fetching actually returned', () => {
    const r = aggregateWeeklyCost(raw({ scans }));
    expect(r.scans.totalRuns).toBe(14);
    expect(r.scans.failedRuns).toBe(7);
    expect(r.scans.postsFetched).toBe(350);
    expect(r.scans.newPosts).toBe(3);
    expect(r.scans.accountsScanned).toBe(2);
  });

  it('flags an account whose every run failed — the waste nobody was watching', () => {
    const r = aggregateWeeklyCost(raw({ scans }));
    const dead = r.scans.rows.find((s) => s.username === 'account-mxiwa_')!;
    const live = r.scans.rows.find((s) => s.username === 'argania')!;
    expect(dead.alwaysFails).toBe(true);
    expect(live.alwaysFails).toBe(false);
  });

  it('prorates the measured Apify bill onto the week and onto each scanned account', () => {
    const r = aggregateWeeklyCost(raw({ scans, apifyUsd: 16, apifyCycleDays: 16 }));
    expect(r.scans.apifyUsdWeek).toBeCloseTo(7, 6);          // $1/day x 7
    expect(r.scans.apifyUsdPerAccountWeek).toBeCloseTo(3.5, 6); // over 2 scanned accounts
  });

  it('says nothing rather than guessing when Apify could not be read', () => {
    const r = aggregateWeeklyCost(raw({ scans, apifyUsd: null, apifyCycleDays: null }));
    expect(r.scans.apifyUsdWeek).toBeNull();
    expect(r.scans.apifyUsdPerAccountWeek).toBeNull();
    // paired presence check, so the nulls above are the unread-Apify branch and not a dead field
    const known = aggregateWeeklyCost(raw({ scans, apifyUsd: 16, apifyCycleDays: 16 }));
    expect(known.scans.apifyUsdWeek).toBeCloseTo(7, 6);
  });
});

describe('aggregateWeeklyCost — account setup', () => {
  it('reports the measured part of setting an account up', () => {
    const r = aggregateWeeklyCost(raw({
      setups: [{ username: 'newbrand', createdAt: '2026-09-01', chunks: 1783, embedTokens: 679889, embedUsd: 0.0884, scanJobs: 3 }],
    }));
    expect(r.setups).toHaveLength(1);
    expect(r.setups[0].embedUsd).toBeCloseTo(0.0884, 6);
    expect(r.setups[0].chunks).toBe(1783);
  });

  it('warns that all-time averages predate CS pricing, so they read low', () => {
    // cost_tracking has priced the chat bot since 2026-08-03 but WhatsApp CS only from the day
    // runCsTurn started recording. Until history catches up, every all-time average counts CS
    // CONVERSATIONS in its denominator with no CS COST in its numerator — it reads too cheap,
    // and a pricing decision taken off it would underprice the product.
    const r = aggregateWeeklyCost(raw());
    expect(r.notMeasured.join(' ')).toMatch(/CS/);
    expect(r.notMeasured.join(' ')).toMatch(/2026-09-09/);
  });

  it('always names what the setup figure leaves out, so it is never read as the whole cost', () => {
    // Nothing prices an Apify run against the account that caused it, and no LLM call in the
    // scan pipeline is recorded at all. A setup number without that caveat reads as complete.
    const r = aggregateWeeklyCost(raw({ setups: [] }));
    expect(r.notMeasured.length).toBeGreaterThan(0);
    const joined = r.notMeasured.join(' ');
    expect(joined).toMatch(/ScrapeCreators/);
    expect(joined).toMatch(/פרסונה|חילוץ|תמלול/);
  });
});

describe('renderWeeklyCostReportHtml', () => {
  const report = () => aggregateWeeklyCost(raw({
    accounts: [
      acct({
        username: 'argania_group',
        week: { costUsd: 24, conversations: 200, turns: 480 },
        prevWeek: { costUsd: 20, conversations: 200 },
        allTime: { costUsd: 100, conversations: 1000, turns: 2400 },
      }),
    ],
    scans: [{ username: 'account-mxiwa_', runs: 7, failedRuns: 7, postsFetched: 0, newPosts: 0 }],
    setups: [{ username: 'newbrand', createdAt: '2026-09-01', chunks: 1783, embedTokens: 679889, embedUsd: 0.0884, scanJobs: 3 }],
    apifyUsd: 16,
    apifyCycleDays: 16,
  }));

  it('carries every section the report was asked for', async () => {
    const { renderWeeklyCostReportHtml } = await import('@/lib/costs/weekly-report');
    const html = renderWeeklyCostReportHtml(report());
    expect(html).toContain('argania_group');       // most expensive accounts, per account
    expect(html).toContain('0.120');               // this week's per-conversation cost
    expect(html).toContain('0.100');               // the all-time average it is compared against
    expect(html).toContain('account-mxiwa_');      // the daily scan, per account
    expect(html).toContain('newbrand');            // account setup
    expect(html).toContain('ScrapeCreators');      // what is not measured
    expect(html).toContain('dir="rtl"');
  });

  it('renders a silent week as a visible zero rather than an empty page', async () => {
    // The lesson from conversation_analysis_runs: a cron that goes quiet looks identical to a
    // quiet week. A week with no traffic must SAY so, loudly, and still arrive.
    const { renderWeeklyCostReportHtml } = await import('@/lib/costs/weekly-report');
    const html = renderWeeklyCostReportHtml(aggregateWeeklyCost(raw()));
    expect(html).toContain('0 שיחות');
    expect(html.length).toBeGreaterThan(200);
  });

  it('never prints NaN, Infinity or undefined', async () => {
    const { renderWeeklyCostReportHtml } = await import('@/lib/costs/weekly-report');
    for (const html of [renderWeeklyCostReportHtml(report()), renderWeeklyCostReportHtml(aggregateWeeklyCost(raw()))]) {
      expect(html).not.toMatch(/NaN|Infinity|undefined|\[object Object\]/);
      expect(html).toContain('<table');   // paired presence check: it really did render content
    }
  });
});

/**
 * A weekly cost number with no revenue beside it cannot answer the question the report is
 * read for — whether an account is worth serving. The three Israeli customers pay ₪2,500 a
 * month each; Colgate is a separate project on its own Supabase, billing $200.
 */
describe('aggregateWeeklyCost — revenue and margin', () => {
  const paying = (username: string, costUsd: number, conversations: number) =>
    acct({ username, week: { costUsd, conversations, turns: conversations * 2 } });

  it('turns a monthly retainer into the share earned in the reported week', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [paying('argania_group', 25, 300)],
      revenue: { monthlyIls: { argania_group: 2500 }, ilsPerUsd: 3.7 },
    }));
    // ₪2,500/month at 3.70 is $675.68, and a 7-day week is 7/30.44 of a month.
    expect(r.revenue!.weekUsd).toBeCloseTo((2500 / 3.7) * (7 / 30.44), 2);
    expect(r.accounts[0].revenueUsd).toBeCloseTo((2500 / 3.7) * (7 / 30.44), 2);
  });

  it('reports margin per account and for the week', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [paying('argania_group', 50, 300), paying('labeaute.israel', 30, 200)],
      revenue: { monthlyIls: { argania_group: 2500, 'labeaute.israel': 2500 }, ilsPerUsd: 3.7 },
    }));
    const weekPerCustomer = (2500 / 3.7) * (7 / 30.44);
    expect(r.revenue!.weekUsd).toBeCloseTo(weekPerCustomer * 2, 2);
    expect(r.revenue!.marginPct).toBeCloseTo(((weekPerCustomer * 2 - 80) / (weekPerCustomer * 2)) * 100, 2);
    expect(r.accounts.find((a) => a.username === 'argania_group')!.marginPct)
      .toBeCloseTo(((weekPerCustomer - 50) / weekPerCustomer) * 100, 2);
  });

  it('leaves an account that pays nothing without a margin, rather than showing -100%', () => {
    const r = aggregateWeeklyCost(raw({
      accounts: [paying('some_demo', 4, 40), paying('argania_group', 20, 200)],
      revenue: { monthlyIls: { argania_group: 2500 }, ilsPerUsd: 3.7 },
    }));
    const demo = r.accounts.find((a) => a.username === 'some_demo')!;
    expect(demo.revenueUsd).toBeNull();
    expect(demo.marginPct).toBeNull();
    // paired presence check: the paying account beside it does get both
    expect(r.accounts.find((a) => a.username === 'argania_group')!.marginPct).toBeGreaterThan(0);
  });

  it('carries external projects that bill outside this database', () => {
    // Colgate has its own Supabase and its own revenue; it belongs on the P&L even though
    // none of its usage is in these tables.
    const r = aggregateWeeklyCost(raw({
      accounts: [paying('argania_group', 20, 200)],
      revenue: {
        monthlyIls: { argania_group: 2500 },
        ilsPerUsd: 3.7,
        external: [{ name: 'colgate', monthlyUsd: 200, monthlyCostUsd: 12.2 }],
      },
    }));
    expect(r.revenue!.external).toHaveLength(1);
    const c = r.revenue!.external[0];
    expect(c.revenueUsd).toBeCloseTo(200 * (7 / 30.44), 2);
    expect(c.costUsd).toBeCloseTo(12.2 * (7 / 30.44), 2);
    expect(c.marginPct).toBeCloseTo(((200 - 12.2) / 200) * 100, 2);
    // and it lands in the week's totals
    expect(r.revenue!.weekUsd).toBeGreaterThan((2500 / 3.7) * (7 / 30.44));
  });

  it('says nothing about revenue when none is configured', () => {
    const r = aggregateWeeklyCost(raw({ accounts: [paying('argania_group', 20, 200)] }));
    expect(r.revenue).toBeNull();
    expect(r.accounts[0].revenueUsd).toBeNull();
    // paired presence check: configuring revenue does produce it
    const withRev = aggregateWeeklyCost(raw({
      accounts: [paying('argania_group', 20, 200)],
      revenue: { monthlyIls: { argania_group: 2500 }, ilsPerUsd: 3.7 },
    }));
    expect(withRev.revenue).not.toBeNull();
  });
});

describe('renderWeeklyCostReportHtml — revenue', () => {
  const withRevenue = () => aggregateWeeklyCost(raw({
    accounts: [acct({
      username: 'argania_group',
      week: { costUsd: 24, conversations: 200, turns: 480 },
      allTime: { costUsd: 100, conversations: 1000, turns: 2400 },
    })],
    revenue: {
      monthlyIls: { argania_group: 2500 },
      ilsPerUsd: 3.7,
      external: [{ name: 'colgate', monthlyUsd: 200, monthlyCostUsd: 12.2 }],
    },
  }));

  it('puts revenue, profit and margin in the mail', async () => {
    const { renderWeeklyCostReportHtml } = await import('@/lib/costs/weekly-report');
    const html = renderWeeklyCostReportHtml(withRevenue());
    expect(html).toMatch(/רווח/);
    expect(html).toMatch(/שוליים/);
    expect(html).toContain('colgate');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('still renders a pure cost report when no revenue is configured', async () => {
    const { renderWeeklyCostReportHtml } = await import('@/lib/costs/weekly-report');
    const html = renderWeeklyCostReportHtml(aggregateWeeklyCost(raw({
      accounts: [acct({ username: 'argania_group', week: { costUsd: 24, conversations: 200, turns: 480 } })],
    })));
    expect(html).not.toContain('colgate');
    expect(html).toContain('<table');   // paired: it really did render
  });
});
