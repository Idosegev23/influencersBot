/**
 * Daily support-requests analytics report — sent at 22:00 Israel time.
 *
 * Vercel cron runs in UTC. IL is UTC+3 in IDT (summer), UTC+2 in IST (winter).
 * Schedule (vercel.json): `"schedule": "0 19 * * *"` → 22:00 IDT / 21:00 IST.
 *
 * For each active account that has `config.support_report_enabled = true`
 * and a `config.support_report_email`, this builds an analytical xlsx with:
 *   - Overview KPIs
 *   - Full ticket table
 *   - Breakdowns by problem type / brand / product category
 *   - Cross-tab pivots (problem × category, problem × brand)
 *   - Daily trend
 *   - Embedded chart images (rendered via quickchart.io)
 *
 * Auth: Bearer `CRON_SECRET`.
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/daily-support-report?account_id=<uuid>&hours=720"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { sendEmailWithAttachments } from '@/lib/email';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface SendResult {
  accountId: string;
  email?: string;
  ticketCount: number;
  sent: boolean;
  error?: string;
}

interface SupportTicket {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  brand: string | null;
  order_number: string | null;
  message: string | null;
  product_id: string | null;
  created_at: string;
  problem_type: string;       // extracted from message
  product_name: string | null; // joined or extracted from message
  product_category: string;    // joined from widget_products
  ref_source: string | null;   // attribution slug (e.g. 'danielamit')
  ref_display: string;         // human-readable name from registry
}

interface InfluencerRegistryItem {
  slug: string;
  display_name: string;
  coupon_code?: string;
}

// PROBLEM_TYPES labels live in BrandSupportTab.tsx — mirror them here so
// the report can also surface them when a ticket happens to have only the
// label text in the message body.
const PROBLEM_TYPE_KNOWN = new Set([
  'מוצר פגום',
  'מוצר שגוי',
  'בעיית משלוח',
  'בעיה בקופון',
  'בעיה בתשלום',
  'איכות מוצר',
  'אחר',
  'פנייה כללית',
]);

const CATEGORY_LABEL_HE: Record<string, string> = {
  hair_care: 'טיפוח שיער',
  face_care: 'טיפוח פנים',
  body_care: 'טיפוח גוף',
  makeup: 'איפור',
  fragrance: 'בשמים',
  skincare: 'טיפוח עור',
  food: 'אוכל',
  spices: 'תבלינים',
  paint: 'צבעים',
  tools: 'כלים',
  service: 'שירותים',
  general: 'כללי',
  other: 'אחר',
  lips: 'טיפוח שפתיים',
  lip_care: 'טיפוח שפתיים',
  accessories: 'אקססוריז',
  sets: 'סטים',
  men: 'לגבר',
  nails: 'ציפורניים',
  sun: 'הגנה מהשמש',
  eyes: 'עיניים',
};

function ilDate(d: string | Date): string {
  return new Date(d).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ilDay(d: string | Date): string {
  return new Date(d).toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ─── Parsing helpers ─────────────────────────────────────────────────

function extractProblemType(message: string | null): string {
  if (!message) return 'לא צוין';
  const match = message.match(/סוג בעיה:\s*(.+?)(?:\n|$)/);
  if (match) {
    const value = match[1].trim();
    if (PROBLEM_TYPE_KNOWN.has(value)) return value;
    return value || 'לא צוין';
  }
  return 'לא צוין';
}

function extractProductFromMessage(message: string | null): string | null {
  if (!message) return null;
  const match = message.match(/מוצר:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

// ─── Charts via quickchart.io ────────────────────────────────────────

async function renderChartPng(config: any, w = 700, h = 420): Promise<Buffer | null> {
  try {
    const res = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: config,
        width: w,
        height: h,
        backgroundColor: 'white',
        format: 'png',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[chart] quickchart ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e: any) {
    console.error('[chart] render failed:', e?.message || e);
    return null;
  }
}

function pieChartConfig(title: string, labels: string[], data: number[]) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            '#883fe2', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
            '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
          ],
        },
      ],
    },
    options: {
      title: { display: true, text: title, fontSize: 18 },
      legend: { position: 'right', rtl: true, textDirection: 'rtl' },
      plugins: {
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 14 },
          formatter: '(v) => v',
        },
      },
    },
  };
}

function barChartConfig(title: string, labels: string[], data: number[], color = '#883fe2') {
  return {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{ label: 'פניות', data, backgroundColor: color }],
    },
    options: {
      title: { display: true, text: title, fontSize: 18 },
      legend: { display: false },
      plugins: {
        datalabels: {
          color: '#1f2937',
          anchor: 'end',
          align: 'end',
          font: { weight: 'bold' },
        },
      },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true, precision: 0 } }],
      },
    },
  };
}

function lineChartConfig(title: string, labels: string[], data: number[]) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'פניות',
          data,
          borderColor: '#883fe2',
          backgroundColor: 'rgba(136, 63, 226, 0.1)',
          fill: true,
          lineTension: 0.3,
        },
      ],
    },
    options: {
      title: { display: true, text: title, fontSize: 18 },
      legend: { display: false },
      scales: {
        yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }],
      },
    },
  };
}

// ─── Workbook builder ────────────────────────────────────────────────

function countBy<T extends string | number>(items: any[], key: (x: any) => T): Map<T, number> {
  const m = new Map<T, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function topNSorted<K>(map: Map<K, number>, n: number): Array<[K, number]> {
  return [...map.entries()].sort(([, a], [, b]) => b - a).slice(0, n);
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

const RTL_VIEW = { rightToLeft: true } as any;

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF883FE2' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });
  row.height = 26;
}

function styleDataRows(ws: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: 'top',
        horizontal: 'right',
        wrapText: true,
        readingOrder: 'rtl',
      } as any;
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      };
      if (r % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
    });
  }
}

interface InfluencerFunnel {
  display_name: string;
  visits: number;
  unique_visitors: number;
  sessions: number;
  tickets: number;
}

async function buildWorkbook(args: {
  brandName: string;
  windowFromIso: string;
  windowToIso: string;
  tickets: SupportTicket[];
  funnels?: InfluencerFunnel[];
}): Promise<Buffer> {
  const { tickets, brandName, windowFromIso, windowToIso, funnels } = args;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BestieAI';
  wb.created = new Date();

  const total = tickets.length;
  const byProblem = countBy(tickets, (t) => t.problem_type);
  const byBrand = countBy(tickets, (t) => t.brand || '— ללא מותג —');
  const byCategory = countBy(tickets, (t) => t.product_category || '— ללא קטגוריה —');

  // Daily trend
  const byDay = new Map<string, number>();
  for (const t of tickets) {
    const d = ilDay(t.created_at);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  // Sort days chronologically by parsing back
  const dayLabels = [...byDay.keys()].sort((a, b) => {
    // a/b are dd.mm.yyyy
    const pa = a.split('.').reverse().join('-');
    const pb = b.split('.').reverse().join('-');
    return pa.localeCompare(pb);
  });
  const dayCounts = dayLabels.map((d) => byDay.get(d) || 0);

  // ─── Sheet 1: סקירה כללית ──────────────────────────────────────
  {
    const ws = wb.addWorksheet('סקירה כללית', { views: [RTL_VIEW] });
    ws.columns = [{ width: 32 }, { width: 18 }];

    ws.mergeCells('A1:B1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `📊 דוח פניות — ${brandName}`;
    titleCell.font = { bold: true, size: 18, color: { argb: 'FF883FE2' } };
    titleCell.alignment = { horizontal: 'right' };
    ws.getRow(1).height = 32;

    ws.mergeCells('A2:B2');
    ws.getCell('A2').value = `${ilDate(windowFromIso)}  ←  ${ilDate(windowToIso)}`;
    ws.getCell('A2').alignment = { horizontal: 'right' };
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };

    ws.addRow([]);
    const kpiHeader = ws.addRow(['מדד', 'ערך']);
    styleHeader(kpiHeader);

    const topProblem = topNSorted(byProblem, 1)[0];
    const topBrand = topNSorted(byBrand, 1)[0];
    const topCategory = topNSorted(byCategory, 1)[0];

    const kpis: Array<[string, any]> = [
      ['סך פניות בתקופה', total],
      ['סוג בעיה הנפוץ ביותר', topProblem ? `${topProblem[0]} (${topProblem[1]})` : '—'],
      ['מותג עם הכי הרבה פניות', topBrand ? `${topBrand[0]} (${topBrand[1]})` : '—'],
      ['קטגוריה עם הכי הרבה פניות', topCategory ? `${topCategory[0]} (${topCategory[1]})` : '—'],
      ['ימי פעילות בתקופה', dayLabels.length],
      ['ממוצע פניות ליום', dayLabels.length ? (total / dayLabels.length).toFixed(1) : '0'],
    ];
    const startKpi = kpiHeader.number + 1;
    for (const [k, v] of kpis) ws.addRow([k, v]);
    styleDataRows(ws, startKpi, startKpi + kpis.length - 1);
  }

  // ─── Sheet 2: כל הפניות ────────────────────────────────────────
  {
    const ws = wb.addWorksheet('כל הפניות', { views: [RTL_VIEW] });
    ws.columns = [
      { header: 'תאריך', key: 'date', width: 18 },
      { header: 'שם לקוח', key: 'name', width: 20 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'מותג', key: 'brand', width: 16 },
      { header: 'משפיענית', key: 'ref', width: 18 },
      { header: 'מוצר', key: 'product', width: 28 },
      { header: 'קטגוריית מוצר', key: 'category', width: 18 },
      { header: 'סוג בעיה', key: 'problem', width: 16 },
      { header: 'מספר הזמנה', key: 'order', width: 14 },
      { header: 'פירוט הפנייה', key: 'message', width: 60 },
    ];
    styleHeader(ws.getRow(1));

    for (const t of tickets) {
      ws.addRow({
        date: ilDate(t.created_at),
        name: t.customer_name || '',
        phone: t.customer_phone || '',
        brand: t.brand || '',
        ref: t.ref_display,
        product: t.product_name || '',
        category: t.product_category || '',
        problem: t.problem_type,
        order: t.order_number || '',
        message: t.message || '',
      });
    }
    if (tickets.length > 0) styleDataRows(ws, 2, 1 + tickets.length);
    ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } } as any;
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, ...RTL_VIEW }];
  }

  // ─── Helper: simple breakdown sheet ─────────────────────────────
  function addBreakdownSheet(name: string, label: string, map: Map<string, number>) {
    const ws = wb.addWorksheet(name, { views: [RTL_VIEW] });
    ws.columns = [
      { header: label, key: 'label', width: 32 },
      { header: 'כמות פניות', key: 'count', width: 14 },
      { header: 'אחוז', key: 'pct', width: 12 },
    ];
    styleHeader(ws.getRow(1));
    const sorted = [...map.entries()].sort(([, a], [, b]) => b - a);
    for (const [k, v] of sorted) {
      ws.addRow({ label: k, count: v, pct: pct(v, total) });
    }
    if (sorted.length > 0) styleDataRows(ws, 2, 1 + sorted.length);
    // Total row
    const totalRow = ws.addRow({ label: 'סה״כ', count: total, pct: '100%' });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7FB' } };
    });
  }

  addBreakdownSheet('לפי סוג בעיה', 'סוג בעיה', byProblem);
  addBreakdownSheet('לפי מותג', 'מותג', byBrand);
  addBreakdownSheet('לפי קטגוריית מוצר', 'קטגוריית מוצר', byCategory);

  // ─── Sheet: פניות לפי משפיענית ─────────────────────────────────
  const byInfluencer = countBy(tickets, (t) => t.ref_display);
  addBreakdownSheet('פניות לפי משפיענית', 'משפיענית / מקור', byInfluencer);

  // ─── Sheet: משפך מלא לפי משפיענית — clicks → sessions → tickets ─
  if (funnels && funnels.length > 0) {
    const ws = wb.addWorksheet('משפך לפי משפיענית', { views: [RTL_VIEW] });
    ws.columns = [
      { header: 'משפיענית / מקור', key: 'name', width: 30 },
      { header: 'קליקים', key: 'visits', width: 12 },
      { header: 'גולשים ייחודיים', key: 'unique', width: 16 },
      { header: 'סשני צ׳אט', key: 'sessions', width: 14 },
      { header: '% המרה', key: 'conv', width: 12 },
      { header: 'פניות תמיכה', key: 'tickets', width: 14 },
    ];
    styleHeader(ws.getRow(1));
    const sortedF = [...funnels].sort((a, b) => b.visits - a.visits);
    for (const f of sortedF) {
      ws.addRow({
        name: f.display_name,
        visits: f.visits,
        unique: f.unique_visitors,
        sessions: f.sessions,
        conv: f.visits > 0 ? `${((f.sessions / f.visits) * 100).toFixed(0)}%` : '—',
        tickets: f.tickets,
      });
    }
    if (sortedF.length > 0) styleDataRows(ws, 2, 1 + sortedF.length);
    const totalVisits = sortedF.reduce((s, x) => s + x.visits, 0);
    const totalUniq = sortedF.reduce((s, x) => s + x.unique_visitors, 0);
    const totalSess = sortedF.reduce((s, x) => s + x.sessions, 0);
    const totalTix = sortedF.reduce((s, x) => s + x.tickets, 0);
    const totalRow = ws.addRow({
      name: 'סה״כ',
      visits: totalVisits,
      unique: totalUniq,
      sessions: totalSess,
      conv: totalVisits > 0 ? `${((totalSess / totalVisits) * 100).toFixed(0)}%` : '—',
      tickets: totalTix,
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7FB' } };
    });
  }

  // ─── Helper: cross-tab pivot ────────────────────────────────────
  function addPivotSheet(name: string, rowLabel: string, colLabel: string,
                          rowKey: (t: SupportTicket) => string,
                          colKey: (t: SupportTicket) => string) {
    const ws = wb.addWorksheet(name, { views: [RTL_VIEW] });

    const cells = new Map<string, Map<string, number>>(); // row → col → count
    const rowTotals = new Map<string, number>();
    const colSet = new Set<string>();

    for (const t of tickets) {
      const r = rowKey(t) || '— ריק —';
      const c = colKey(t) || '— ריק —';
      colSet.add(c);
      if (!cells.has(r)) cells.set(r, new Map());
      const inner = cells.get(r)!;
      inner.set(c, (inner.get(c) || 0) + 1);
      rowTotals.set(r, (rowTotals.get(r) || 0) + 1);
    }

    const rows = [...rowTotals.entries()].sort(([, a], [, b]) => b - a).map(([r]) => r);
    const cols = [...colSet].sort();

    // Header row
    const header = [`${rowLabel} ↓ / ${colLabel} →`, ...cols, 'סה״כ'];
    ws.addRow(header);
    styleHeader(ws.getRow(1));

    // Column widths
    ws.getColumn(1).width = 26;
    for (let i = 2; i <= cols.length + 2; i++) ws.getColumn(i).width = 16;

    // Data rows
    for (const r of rows) {
      const inner = cells.get(r) || new Map();
      const rowVals = cols.map((c) => inner.get(c) || 0);
      ws.addRow([r, ...rowVals, rowTotals.get(r)]);
    }

    // Footer: column totals + grand total
    const colTotals = cols.map((c) => {
      let s = 0;
      for (const inner of cells.values()) s += inner.get(c) || 0;
      return s;
    });
    const grandTotal = colTotals.reduce((a, b) => a + b, 0);
    const footerRow = ws.addRow(['סה״כ', ...colTotals, grandTotal]);
    footerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7FB' } };
    });

    if (rows.length > 0) styleDataRows(ws, 2, 1 + rows.length);
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1, ...RTL_VIEW }];
  }

  addPivotSheet(
    'פיבוט — סוג × קטגוריה',
    'סוג בעיה',
    'קטגוריה',
    (t) => t.problem_type,
    (t) => t.product_category || '— ללא —',
  );

  addPivotSheet(
    'פיבוט — סוג × מותג',
    'סוג בעיה',
    'מותג',
    (t) => t.problem_type,
    (t) => t.brand || '— ללא —',
  );

  addPivotSheet(
    'פיבוט — משפיענית × סוג',
    'משפיענית',
    'סוג בעיה',
    (t) => t.ref_display,
    (t) => t.problem_type,
  );

  // ─── Sheet: מגמה יומית ──────────────────────────────────────────
  {
    const ws = wb.addWorksheet('מגמה יומית', { views: [RTL_VIEW] });
    ws.columns = [
      { header: 'תאריך', key: 'date', width: 16 },
      { header: 'כמות פניות', key: 'count', width: 14 },
    ];
    styleHeader(ws.getRow(1));
    for (const d of dayLabels) ws.addRow({ date: d, count: byDay.get(d) || 0 });
    if (dayLabels.length > 0) styleDataRows(ws, 2, 1 + dayLabels.length);
  }

  // ─── Sheet: גרפים (PNG embedded) ────────────────────────────────
  if (tickets.length > 0) {
    const ws = wb.addWorksheet('גרפים', { views: [RTL_VIEW] });
    ws.getColumn('A').width = 100;

    const charts: Array<{ title: string; cfg: any; w?: number; h?: number }> = [
      {
        title: 'התפלגות לפי סוג בעיה',
        cfg: pieChartConfig(
          'התפלגות לפי סוג בעיה',
          [...byProblem.keys()],
          [...byProblem.values()],
        ),
      },
      {
        title: 'פניות לפי קטגוריה',
        cfg: barChartConfig(
          'פניות לפי קטגוריית מוצר',
          topNSorted(byCategory, 10).map(([k]) => k),
          topNSorted(byCategory, 10).map(([, v]) => v),
          '#10b981',
        ),
      },
      {
        title: 'פניות לפי משפיענית',
        cfg: barChartConfig(
          'פניות לפי משפיענית',
          topNSorted(byInfluencer, 10).map(([k]) => k),
          topNSorted(byInfluencer, 10).map(([, v]) => v),
          '#f59e0b',
        ),
      },
      {
        title: 'פניות לפי מותג',
        cfg: barChartConfig(
          'פניות לפי מותג (Top 10)',
          topNSorted(byBrand, 10).map(([k]) => k),
          topNSorted(byBrand, 10).map(([, v]) => v),
          '#ec4899',
        ),
      },
    ];

    if (dayLabels.length >= 2) {
      charts.push({
        title: 'מגמה יומית',
        cfg: lineChartConfig('מגמה יומית', dayLabels, dayCounts),
        w: 900,
        h: 380,
      });
    }

    let row = 1;
    for (const c of charts) {
      const headerRow = ws.getRow(row);
      headerRow.getCell('A').value = `📈 ${c.title}`;
      headerRow.getCell('A').font = { bold: true, size: 14, color: { argb: 'FF883FE2' } };
      headerRow.getCell('A').alignment = { horizontal: 'right' };
      headerRow.height = 24;

      const png = await renderChartPng(c.cfg, c.w || 700, c.h || 420);
      if (png) {
        const id = wb.addImage({ buffer: png as any, extension: 'png' });
        ws.addImage(id, {
          tl: { col: 0, row },
          ext: { width: c.w || 700, height: c.h || 420 },
        } as any);
        // Reserve space (each row ~20px high). Add ~22 rows per chart.
        for (let r = row + 1; r < row + 22; r++) ws.getRow(r).height = 20;
        row += 24;
      } else {
        ws.getRow(row + 1).getCell('A').value = '⚠️ לא ניתן היה לרנדר את הגרף';
        row += 3;
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── Per-account processor ───────────────────────────────────────────

async function processAccount(args: {
  supabase: ReturnType<typeof createClient>;
  account: { id: string; config: any };
  windowFromIso: string;
  windowToIso: string;
}): Promise<SendResult> {
  const { supabase, account, windowFromIso, windowToIso } = args;
  const cfg = account.config || {};
  const email = cfg.support_report_email as string | undefined;
  const brandName = cfg.display_name || cfg.username || account.id;

  if (!email) {
    return { accountId: account.id, ticketCount: 0, sent: false, error: 'no email configured' };
  }

  const { data: rows, error } = await supabase
    .from('support_requests')
    .select(
      'id, customer_name, customer_phone, brand, order_number, message, product_id, created_at, ref_source',
    )
    .eq('account_id', account.id)
    .gte('created_at', windowFromIso)
    .lte('created_at', windowToIso)
    .order('created_at', { ascending: false });

  if (error) {
    return { accountId: account.id, email, ticketCount: 0, sent: false, error: error.message };
  }

  // Resolve product categories in one batched query
  const productIds = [...new Set((rows || []).map((r) => r.product_id).filter(Boolean) as string[])];
  let productLookup = new Map<string, { name: string; category: string }>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('widget_products')
      .select('id, name_he, name, category')
      .in('id', productIds);
    for (const p of products || []) {
      productLookup.set(p.id, {
        name: p.name_he || p.name || '',
        category: CATEGORY_LABEL_HE[p.category] || p.category || '— לא ידוע —',
      });
    }
  }

  // Influencer registry for human-readable attribution names
  const registry: InfluencerRegistryItem[] = (cfg.influencer_registry as InfluencerRegistryItem[]) || [];
  const refLookup = new Map<string, string>();
  for (const item of registry) {
    if (item.slug) refLookup.set(item.slug.toLowerCase(), item.display_name || item.slug);
    if (item.coupon_code) refLookup.set(item.coupon_code.toLowerCase(), item.display_name || item.slug);
  }

  const tickets: SupportTicket[] = (rows || []).map((r) => {
    const productInfo = r.product_id ? productLookup.get(r.product_id) : undefined;
    const slug = (r.ref_source || '').toLowerCase() || null;
    return {
      id: r.id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      brand: r.brand,
      order_number: r.order_number,
      message: r.message,
      product_id: r.product_id,
      created_at: r.created_at,
      problem_type: extractProblemType(r.message),
      product_name: productInfo?.name || extractProductFromMessage(r.message),
      product_category: productInfo?.category || '— ללא מוצר —',
      ref_source: slug,
      ref_display: slug ? (refLookup.get(slug) || slug) : '— ישיר / לא ידוע —',
    };
  });

  // Build the per-influencer funnel from chat_visits + chat_sessions.
  const [{ data: visitsRows }, { data: sessRows }] = await Promise.all([
    supabase
      .from('chat_visits')
      .select('ref_source, anon_id')
      .eq('account_id', account.id)
      .gte('created_at', windowFromIso)
      .lte('created_at', windowToIso),
    supabase
      .from('chat_sessions')
      .select('ref_source')
      .eq('account_id', account.id)
      .gte('created_at', windowFromIso)
      .lte('created_at', windowToIso),
  ]);
  const fmap = new Map<string, InfluencerFunnel>();
  const fGet = (slug: string | null) => {
    const key = (slug || '__direct__').toLowerCase();
    if (!fmap.has(key)) {
      fmap.set(key, {
        display_name: slug ? (refLookup.get(key) || slug) : '— ישיר —',
        visits: 0,
        unique_visitors: 0,
        sessions: 0,
        tickets: 0,
      });
    }
    return fmap.get(key)!;
  };
  const visitUniq = new Map<string, Set<string>>();
  for (const v of visitsRows || []) {
    const key = (v.ref_source || '__direct__').toLowerCase();
    fGet(v.ref_source).visits += 1;
    if (v.anon_id) {
      if (!visitUniq.has(key)) visitUniq.set(key, new Set());
      visitUniq.get(key)!.add(v.anon_id);
    }
  }
  for (const [key, set] of visitUniq) {
    const f = fmap.get(key);
    if (f) f.unique_visitors = set.size;
  }
  for (const s of sessRows || []) fGet(s.ref_source).sessions += 1;
  for (const t of tickets) fGet(t.ref_source).tickets += 1;
  // Make sure every registered influencer is represented even with 0
  for (const it of registry) {
    const key = it.slug.toLowerCase();
    if (!fmap.has(key)) {
      fmap.set(key, {
        display_name: it.display_name || it.slug,
        visits: 0,
        unique_visitors: 0,
        sessions: 0,
        tickets: 0,
      });
    }
  }
  const funnels = [...fmap.values()];

  const xlsxBuffer = await buildWorkbook({
    brandName,
    windowFromIso,
    windowToIso,
    tickets,
    funnels,
  });

  const newCount = tickets.length;
  const byProblem = countBy(tickets, (t) => t.problem_type);
  const topProblems = topNSorted(byProblem, 5);

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #883fe2, #ec4899); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 20px;">📊 דוח פניות יומי — ${brandName}</h2>
        <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">
          ${ilDate(windowFromIso)} ← ${ilDate(windowToIso)}
        </p>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #1f2937;">קובץ Excel מלא ואנליטי מצורף — כולל סקירה, פירוט מלא, חיתוכים לפי סוג בעיה / מותג / קטגוריה, פיבוטים וגרפים.</p>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <div style="font-size: 26px; font-weight: bold; color: #883fe2;">${newCount}</div>
          <div style="font-size: 13px; color: #6b7280;">סך פניות בתקופה</div>
        </div>
        ${topProblems.length > 0 ? `
        <h3 style="margin: 18px 0 8px; font-size: 15px; color: #1f2937;">🏷️ סוגי הבעיות הנפוצים</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${topProblems.map(([k, v]) => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${k}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold; width: 60px;">${v}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 60px;">${pct(v, newCount)}</td>
            </tr>`).join('')}
        </table>` : ''}
        <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
          נשלח אוטומטית מ-BestieAI | ${ilDate(new Date())}
        </p>
      </div>
    </div>
  `;

  const todayIl = new Date()
    .toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
    .replace(/\./g, '-');
  const filename = `support-${brandName}-${todayIl}.xlsx`;

  const result = await sendEmailWithAttachments({
    to: email,
    subject: `📊 דוח פניות — ${brandName} (${newCount} פניות)`,
    html,
    attachments: [
      {
        filename,
        content: xlsxBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  });

  return {
    accountId: account.id,
    email,
    ticketCount: newCount,
    sent: result.success,
    error: result.error,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountIdFilter = url.searchParams.get('account_id');
  const hoursWindow = Number(url.searchParams.get('hours') || '24');
  const force = url.searchParams.get('force') === '1';

  // Israel-time gate: vercel.json schedules two UTC slots (19:00 + 20:00)
  // so one of them always lands on 22:00 Asia/Jerusalem regardless of DST.
  // The other one is silently skipped here. Manual reruns can pass ?force=1
  // to bypass the time check.
  const ilHour = Number(
    new Intl.DateTimeFormat('en-IL', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );

  if (!force && ilHour !== 22) {
    console.log(`[daily-support-report] skip — IL hour is ${ilHour}, target 22`);
    return NextResponse.json({ skipped: true, ilHour, reason: 'not 22:00 IL' });
  }

  const windowToIso = new Date().toISOString();
  const windowFromIso = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();

  const supabase = createClient();
  const results: SendResult[] = [];

  try {
    let q = supabase
      .from('accounts')
      .select('id, config')
      .eq('status', 'active');

    if (accountIdFilter) q = q.eq('id', accountIdFilter);

    const { data: accounts, error } = await q;
    if (error) throw new Error(error.message);

    const candidates = (accounts || []).filter((a: any) => {
      const cfg = a.config || {};
      return cfg.support_report_enabled === true && cfg.support_report_email;
    });

    console.log(
      `[daily-support-report] window ${windowFromIso} → ${windowToIso}, ${candidates.length} accounts to process`,
    );

    for (const account of candidates) {
      try {
        const r = await processAccount({
          supabase,
          account: account as any,
          windowFromIso,
          windowToIso,
        });
        results.push(r);
        console.log(
          `[daily-support-report] ${r.accountId} → ${r.email}: ${r.ticketCount} tickets, sent=${r.sent}${r.error ? ' err=' + r.error : ''}`,
        );
      } catch (e: any) {
        results.push({
          accountId: (account as any).id,
          ticketCount: 0,
          sent: false,
          error: e?.message || String(e),
        });
      }
    }

    return NextResponse.json({
      success: true,
      windowFromIso,
      windowToIso,
      processed: results.length,
      sent: results.filter((r) => r.sent).length,
      results,
    });
  } catch (e: any) {
    console.error('[daily-support-report] fatal:', e);
    return NextResponse.json({ error: e?.message || 'fatal' }, { status: 500 });
  }
}
