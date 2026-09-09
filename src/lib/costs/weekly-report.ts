/**
 * The Sunday-morning cost report.
 *
 * The per-conversation cost is the number the team prices on — the Multiview ladder is a
 * multiple of it — and until now nobody watched it move between one measurement and the next.
 *
 * The DB read (fetchRawCostData) is kept apart from the arithmetic (aggregateWeeklyCost) so the
 * parts that actually get a decision wrong — a division by zero, a delta sign, a ranking — are
 * testable without a database.
 */

export interface AccountCostInput {
  accountId: string;
  username: string;
  week: { costUsd: number; conversations: number; turns: number };
  prevWeek: { costUsd: number; conversations: number };
  allTime: { costUsd: number; conversations: number; turns: number };
}

export interface ScanInput {
  username: string;
  runs: number;
  failedRuns: number;
  postsFetched: number;
  newPosts: number;
}

export interface SetupInput {
  username: string;
  createdAt: string;
  chunks: number;
  embedTokens: number;
  embedUsd: number;
  scanJobs: number;
}

export interface RawCostData {
  weekStart: string;
  weekEnd: string;
  accounts: AccountCostInput[];
  scans: ScanInput[];
  setups: SetupInput[];
  /** Apify's own billed total for its current cycle. null when the API could not be read. */
  apifyUsd: number | null;
  apifyCycleDays: number | null;
}

export interface AccountRow {
  accountId: string;
  username: string;
  costUsd: number;
  conversations: number;
  turns: number;
  /** null when the account was billed with no conversations behind it — never Infinity. */
  usdPerConversation: number | null;
  prevUsdPerConversation: number | null;
  deltaPct: number | null;
}

export interface ScanRow extends ScanInput {
  /** Every run this week failed. A scan that cannot succeed still costs a scan. */
  alwaysFails: boolean;
}

export interface ScanSummary {
  totalRuns: number;
  failedRuns: number;
  postsFetched: number;
  newPosts: number;
  accountsScanned: number;
  /** Apify's own billed total, prorated onto the seven days. null when the API could not be read. */
  apifyUsdWeek: number | null;
  apifyUsdPerAccountWeek: number | null;
  rows: ScanRow[];
}

export interface WeeklyCostReport {
  weekStart: string;
  weekEnd: string;
  week: { costUsd: number; conversations: number; turns: number; usdPerConversation: number | null; usdPerTurn: number | null };
  allTime: { costUsd: number; conversations: number; turns: number; usdPerConversation: number | null };
  comparison: { direction: 'up' | 'down' | 'flat' | 'unknown'; deltaPct: number | null };
  accounts: AccountRow[];
  scans: ScanSummary;
  setups: SetupInput[];
  /**
   * Stated on every report. The scan figures cover Apify, which bills us directly and is read
   * from its own API — nothing else in the pipeline is priced, so a setup or scan number
   * without this note reads as the whole cost when it is a fraction of it.
   */
  notMeasured: string[];
}

/**
 * The day runCsTurn started calling recordTurnCost. Before it, cost_tracking priced the chat bot
 * alone while chat_sessions already counted CS conversations — so any average spanning that date
 * has CS conversations in its denominator and no CS cost in its numerator, and reads too cheap.
 */
export const CS_PRICING_SINCE = '2026-09-09';

const NOT_MEASURED = [
  `עלות תורי WhatsApp CS נרשמת רק מ-${CS_PRICING_SINCE}. ממוצע "כללי" שחוצה את התאריך הזה סופר שיחות CS בלי העלות שלהן — כלומר נמוך מהאמת. לתמחור, השתמשו בממוצע השבועי.`,
  'ScrapeCreators — אין endpoint של usage, התעריף רק בדשבורד שלהם (~7 קריאות לסריקה מוצלחת)',
  'קריאות ה-LLM של צינור הסריקה — חילוץ מוצרים, יצירת פרסונה, תמלול — אף אחת לא נרשמת',
  'Apify נמדד ברמת הארגון בלבד; ריצה לא נושאת account_id, אז הפיצול לחשבון הוא חלוקה שווה',
];

/** Divide, or say we cannot — an average over nothing is not zero, it is absent. */
function per(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

function ilDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The seven days that closed the day before the run. The cron fires Sunday 08:00 Israel time,
 * so the report covers the Sunday–Saturday week that just ended — not the one it is standing in.
 */
export function weekRangeFor(now: Date): { weekStart: string; weekEnd: string } {
  const today = ilDate(now);
  return { weekStart: addDays(today, -7), weekEnd: addDays(today, -1) };
}

export function aggregateWeeklyCost(raw: RawCostData): WeeklyCostReport {
  const weekCost = raw.accounts.reduce((s, a) => s + a.week.costUsd, 0);
  const weekConvos = raw.accounts.reduce((s, a) => s + a.week.conversations, 0);
  const weekTurns = raw.accounts.reduce((s, a) => s + a.week.turns, 0);

  const allCost = raw.accounts.reduce((s, a) => s + a.allTime.costUsd, 0);
  const allConvos = raw.accounts.reduce((s, a) => s + a.allTime.conversations, 0);
  const allTurns = raw.accounts.reduce((s, a) => s + a.allTime.turns, 0);

  const weekAvg = per(weekCost, weekConvos);
  const allAvg = per(allCost, allConvos);

  let direction: WeeklyCostReport['comparison']['direction'] = 'unknown';
  let deltaPct: number | null = null;
  if (weekAvg !== null && allAvg !== null && allAvg > 0) {
    deltaPct = ((weekAvg - allAvg) / allAvg) * 100;
    direction = Math.abs(deltaPct) < 0.5 ? 'flat' : deltaPct > 0 ? 'up' : 'down';
  }

  const accounts: AccountRow[] = raw.accounts
    // An account that neither spent nor talked adds a row of zeroes and nothing else.
    .filter((a) => a.week.costUsd > 0 || a.week.conversations > 0)
    .map((a) => {
      const usdPerConversation = per(a.week.costUsd, a.week.conversations);
      const prevUsdPerConversation = per(a.prevWeek.costUsd, a.prevWeek.conversations);
      const delta =
        usdPerConversation !== null && prevUsdPerConversation !== null && prevUsdPerConversation > 0
          ? ((usdPerConversation - prevUsdPerConversation) / prevUsdPerConversation) * 100
          : null;
      return {
        accountId: a.accountId,
        username: a.username,
        costUsd: a.week.costUsd,
        conversations: a.week.conversations,
        turns: a.week.turns,
        usdPerConversation,
        prevUsdPerConversation,
        deltaPct: delta,
      };
    })
    .sort((x, y) => y.costUsd - x.costUsd);

  const totalRuns = raw.scans.reduce((s, x) => s + x.runs, 0);
  const apifyPerDay =
    raw.apifyUsd !== null && raw.apifyCycleDays !== null && raw.apifyCycleDays > 0
      ? raw.apifyUsd / raw.apifyCycleDays
      : null;
  const apifyUsdWeek = apifyPerDay !== null ? apifyPerDay * 7 : null;
  const accountsScanned = raw.scans.length;

  const scans: ScanSummary = {
    totalRuns,
    failedRuns: raw.scans.reduce((s, x) => s + x.failedRuns, 0),
    postsFetched: raw.scans.reduce((s, x) => s + x.postsFetched, 0),
    newPosts: raw.scans.reduce((s, x) => s + x.newPosts, 0),
    accountsScanned,
    apifyUsdWeek,
    apifyUsdPerAccountWeek: apifyUsdWeek !== null && accountsScanned > 0 ? apifyUsdWeek / accountsScanned : null,
    rows: raw.scans
      .map((x) => ({ ...x, alwaysFails: x.runs > 0 && x.failedRuns === x.runs }))
      .sort((a, b) => b.runs - a.runs),
  };

  return {
    weekStart: raw.weekStart,
    weekEnd: raw.weekEnd,
    week: {
      costUsd: weekCost,
      conversations: weekConvos,
      turns: weekTurns,
      usdPerConversation: weekAvg,
      usdPerTurn: per(weekCost, weekTurns),
    },
    allTime: {
      costUsd: allCost,
      conversations: allConvos,
      turns: allTurns,
      usdPerConversation: allAvg,
    },
    comparison: { direction, deltaPct },
    accounts,
    scans,
    setups: raw.setups,
    notMeasured: NOT_MEASURED,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const usd = (n: number | null, digits = 2): string => (n === null ? '—' : `$${n.toFixed(digits)}`);
const num = (n: number): string => n.toLocaleString('en-US');
const pct = (n: number | null): string => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
const esc = (s: string): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const ARROW = { up: '🔺', down: '🔻', flat: '▪️', unknown: '—' } as const;

export function renderWeeklyCostReportHtml(r: WeeklyCostReport): string {
  const cell = 'padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;';
  const head = 'padding:8px 10px;background:#f3f4f6;font-size:12px;color:#374151;text-align:right;font-weight:600;';

  const accountRows = r.accounts.length
    ? r.accounts.map((a) => `<tr>
        <td style="${cell}">${esc(a.username)}</td>
        <td style="${cell}">${num(a.conversations)}</td>
        <td style="${cell}">${num(a.turns)}</td>
        <td style="${cell}">${usd(a.costUsd)}</td>
        <td style="${cell}"><b>${usd(a.usdPerConversation, 3)}</b></td>
        <td style="${cell}">${pct(a.deltaPct)}</td>
      </tr>`).join('')
    : `<tr><td style="${cell}" colspan="6">אין חשבון עם עלות או שיחה השבוע</td></tr>`;

  const scanRows = r.scans.rows.length
    ? r.scans.rows.map((s) => `<tr>
        <td style="${cell}">${esc(s.username)}${s.alwaysFails ? ' <span style="color:#ef4444">🔴 כל הריצות נכשלו</span>' : ''}</td>
        <td style="${cell}">${num(s.runs)}</td>
        <td style="${cell}">${num(s.failedRuns)}</td>
        <td style="${cell}">${num(s.postsFetched)}</td>
        <td style="${cell}">${num(s.newPosts)}</td>
      </tr>`).join('')
    : `<tr><td style="${cell}" colspan="5">לא רצו סריקות יומיות השבוע</td></tr>`;

  const setupRows = r.setups.length
    ? r.setups.map((s) => `<tr>
        <td style="${cell}">${esc(s.username)}</td>
        <td style="${cell}">${esc(s.createdAt)}</td>
        <td style="${cell}">${num(s.chunks)}</td>
        <td style="${cell}">${usd(s.embedUsd, 4)}</td>
        <td style="${cell}">${num(s.scanJobs)}</td>
      </tr>`).join('')
    : `<tr><td style="${cell}" colspan="5">לא הוקם חשבון חדש השבוע</td></tr>`;

  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#1f2937;">
  <div style="background:#9334EB;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
    <h2 style="margin:0;font-size:19px;">דוח עלויות שבועי</h2>
    <div style="opacity:.85;font-size:13px;margin-top:4px;">${esc(r.weekStart)} — ${esc(r.weekEnd)}</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:22px;">

    <p style="font-size:15px;line-height:1.7;margin:0 0 18px;">
      <b>${usd(r.week.costUsd)}</b> על <b>${num(r.week.conversations)} שיחות</b> (${num(r.week.turns)} תורים).<br>
      ממוצע לשיחה השבוע: <b style="font-size:17px;">${usd(r.week.usdPerConversation, 3)}</b>
      &nbsp;·&nbsp; לתור: ${usd(r.week.usdPerTurn, 4)}
    </p>

    <h3 style="font-size:14px;margin:0 0 6px;">שבוע מול ממוצע כללי</h3>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px;">
      השבוע ${usd(r.week.usdPerConversation, 3)} מול ${usd(r.allTime.usdPerConversation, 3)} מאז ומתמיד
      (${num(r.allTime.conversations)} שיחות, ${usd(r.allTime.costUsd)}).
      ${ARROW[r.comparison.direction]} <b>${pct(r.comparison.deltaPct)}</b>
    </p>

    <h3 style="font-size:14px;margin:0 0 6px;">החשבונות היקרים</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr><th style="${head}">חשבון</th><th style="${head}">שיחות</th><th style="${head}">תורים</th><th style="${head}">עלות</th><th style="${head}">$/שיחה</th><th style="${head}">מול שבוע שעבר</th></tr>
      ${accountRows}
    </table>

    <h3 style="font-size:14px;margin:0 0 6px;">סריקה יומית</h3>
    <p style="font-size:13px;line-height:1.7;margin:0 0 8px;">
      ${num(r.scans.totalRuns)} ריצות על ${num(r.scans.accountsScanned)} חשבונות, מתוכן ${num(r.scans.failedRuns)} נכשלו.
      נשלפו ${num(r.scans.postsFetched)} פוסטים ונמצאו ${num(r.scans.newPosts)} חדשים.<br>
      Apify (נמדד): ${usd(r.scans.apifyUsdWeek)} לשבוע, ${usd(r.scans.apifyUsdPerAccountWeek, 3)} לחשבון.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr><th style="${head}">חשבון</th><th style="${head}">ריצות</th><th style="${head}">נכשלו</th><th style="${head}">פוסטים</th><th style="${head}">חדשים</th></tr>
      ${scanRows}
    </table>

    <h3 style="font-size:14px;margin:0 0 6px;">הקמת חשבונות חדשים</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr><th style="${head}">חשבון</th><th style="${head}">נוצר</th><th style="${head}">chunks</th><th style="${head}">embeddings</th><th style="${head}">סריקות</th></tr>
      ${setupRows}
    </table>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;">
      <b style="font-size:13px;">מה לא נמדד</b>
      <ul style="font-size:12px;line-height:1.7;margin:6px 0 0;padding-inline-start:18px;">
        ${r.notMeasured.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ul>
    </div>

    <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">
      עלות המודלים מגיעה מ-cost_tracking (צ'אט + WhatsApp CS), Apify מ-API החיוב שלו. נשלח אוטומטית מ-BestieAI.
    </p>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Reading the week
// ---------------------------------------------------------------------------

/** USD per 1M tokens for the embedding model the scan pipeline uses. Mirrors costs/pricing.ts. */
const EMBED_USD_PER_M = 0.13;

/**
 * Apify bills us directly and is the one scan cost with a real number behind it, so it is read
 * from Apify's own usage API rather than modelled. A failure here is not fatal — the report says
 * "—" for Apify and still goes out, because the conversation numbers are the point.
 */
async function fetchApifyUsage(): Promise<{ apifyUsd: number | null; apifyCycleDays: number | null }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { apifyUsd: null, apifyCycleDays: null };
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${token}`);
    if (!res.ok) throw new Error(`apify ${res.status}`);
    const d = (await res.json())?.data;
    const usd = d?.totalUsageCreditsUsdBeforeVolumeDiscount ?? d?.totalUsageCreditsUsd ?? null;
    const start = d?.usageCycle?.startAt ? new Date(d.usageCycle.startAt) : null;
    // Days ELAPSED in the cycle, not its length — the total so far covers only those.
    const days = start ? Math.max(1, (Date.now() - start.getTime()) / 86_400_000) : null;
    return { apifyUsd: typeof usd === 'number' ? usd : null, apifyCycleDays: days };
  } catch (err) {
    console.warn('[weekly-cost-report] apify usage unavailable:', err);
    return { apifyUsd: null, apifyCycleDays: null };
  }
}

export async function fetchRawCostData(range: { weekStart: string; weekEnd: string }): Promise<RawCostData> {
  const { supabase } = await import('@/lib/supabase');
  const args = { p_week_start: range.weekStart, p_week_end: range.weekEnd };

  const [costs, scans, setups, apify] = await Promise.all([
    supabase.rpc('weekly_cost_report', args),
    supabase.rpc('weekly_scan_report', args),
    supabase.rpc('weekly_setup_report', args),
    fetchApifyUsage(),
  ]);

  // A broken query must not read as a quiet week — that is exactly how conversation_analysis_runs
  // stayed empty for months. Throw, and let runWeeklyCostReport mail the failure.
  for (const [name, r] of [['weekly_cost_report', costs], ['weekly_scan_report', scans], ['weekly_setup_report', setups]] as const) {
    if (r.error) throw new Error(`${name}: ${r.error.message}`);
  }

  const n = (v: any) => Number(v ?? 0);

  return {
    ...range,
    accounts: ((costs.data as any[]) || []).map((r) => ({
      accountId: r.account_id,
      username: r.username,
      week: { costUsd: n(r.week_cost), conversations: n(r.week_conversations), turns: n(r.week_turns) },
      prevWeek: { costUsd: n(r.prev_cost), conversations: n(r.prev_conversations) },
      allTime: { costUsd: n(r.all_cost), conversations: n(r.all_conversations), turns: n(r.all_turns) },
    })),
    scans: ((scans.data as any[]) || []).map((r) => ({
      username: r.username,
      runs: n(r.runs),
      failedRuns: n(r.failed_runs),
      postsFetched: n(r.posts_fetched),
      newPosts: n(r.new_posts),
    })),
    setups: ((setups.data as any[]) || []).map((r) => ({
      username: r.username,
      createdAt: String(r.created_at),
      chunks: n(r.chunks),
      embedTokens: n(r.embed_tokens),
      embedUsd: (n(r.embed_tokens) / 1e6) * EMBED_USD_PER_M,
      scanJobs: n(r.scan_jobs),
    })),
    ...apify,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * The three people who asked for it. Overridable by env for the same reason
 * ADMIN_ALERT_RECIPIENTS is: a recipient list that only lives in code is a deploy away
 * from being wrong.
 */
export const COST_REPORT_RECIPIENTS: string[] = (
  process.env.COST_REPORT_EMAILS || 'cto@ldrsgroup.com,yoav@ldrsgroup.com,itamar@ldrsgroup.com'
)
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

export interface RunResult {
  ok: boolean;
  sent: boolean;
  report?: WeeklyCostReport;
  error?: string;
}

/**
 * Build the week's report and mail it.
 *
 * It sends on EVERY outcome — a quiet week, and a week whose query blew up. A cron that goes
 * silent looks exactly like a week with no traffic, which is how `conversation_analysis_runs`
 * stayed empty for months with nobody noticing, so silence is never an option here.
 */
export async function runWeeklyCostReport(opts?: {
  now?: Date;
  sendEmail?: boolean;
  fetch?: (range: { weekStart: string; weekEnd: string }) => Promise<RawCostData>;
}): Promise<RunResult> {
  const now = opts?.now ?? new Date();
  const range = weekRangeFor(now);
  const shouldSend = opts?.sendEmail !== false;
  const fetcher = opts?.fetch ?? fetchRawCostData;
  const { sendEmail } = await import('@/lib/email');

  let report: WeeklyCostReport;
  try {
    report = aggregateWeeklyCost(await fetcher(range));
  } catch (err: any) {
    const message = String(err?.message || err);
    if (shouldSend) {
      try {
        await sendEmail({
          to: COST_REPORT_RECIPIENTS,
          subject: `[קריטי] דוח העלויות השבועי נכשל — ${range.weekStart}..${range.weekEnd}`,
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;">
            <h3>דוח העלויות לא נבנה</h3>
            <p>השבוע ${range.weekStart} — ${range.weekEnd} לא הופק. השגיאה:</p>
            <pre style="direction:ltr;background:#f3f4f6;padding:12px;border-radius:8px;">${message}</pre>
            <p>עד שזה נפתר אין מדידה של העלות לשיחה.</p>
          </div>`,
        });
      } catch (mailErr) {
        console.error('[weekly-cost-report] failure mail failed too:', mailErr);
      }
    }
    return { ok: false, sent: false, error: message };
  }

  if (!shouldSend) return { ok: true, sent: false, report };

  const avg = report.week.usdPerConversation;
  try {
    await sendEmail({
      to: COST_REPORT_RECIPIENTS,
      subject: `דוח עלויות ${range.weekStart}–${range.weekEnd} · ${usd(report.week.costUsd)} · ${usd(avg, 3)} לשיחה`,
      html: renderWeeklyCostReportHtml(report),
    });
  } catch (err: any) {
    const message = String(err?.message || err);
    console.error('[weekly-cost-report] send failed:', message);
    return { ok: true, sent: false, report, error: message };
  }

  return { ok: true, sent: true, report };
}
