/**
 * GET …/conversations/export?format=xlsx
 *
 * `include_messages=1` adds the per-conversation summary sheet. It is a
 * separate, explicitly-requested flag because that sheet carries customer text;
 * the automated weekly push never sets it.
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { addSheet } from '@/lib/reports/xlsx';
import { buildReport } from '@/lib/conversation-analytics/aggregate';
import { INQUIRY_TYPE_LABEL_HE, type InquiryType } from '@/lib/conversation-analytics/taxonomy';
import { parseRange } from '@/lib/conversation-analytics/range';
import {
  fetchClassificationRows,
  fetchConnectedChannels,
  filtersFromParams,
} from '@/lib/conversation-analytics/query';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CHANNEL_LABEL_HE: Record<string, string> = {
  web: 'ווידג׳ט ועמוד צ׳אט',
  whatsapp: 'וואטסאפ',
  instagram: 'אינסטגרם',
  unknown: 'לא ידוע',
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  try {
    const sp = req.nextUrl.searchParams;
    const range = parseRange(sp, new Date());
    const filters = filtersFromParams(sp);

    const [rows, previous, channels] = await Promise.all([
      fetchClassificationRows({ accountId: influencer.id, fromIso: range.fromIso, toIso: range.toIso, filters }),
      fetchClassificationRows({ accountId: influencer.id, fromIso: range.prevFromIso, toIso: range.prevToIso, filters }),
      fetchConnectedChannels(influencer.id),
    ]);

    const report = buildReport({ current: rows, previous, connectedChannels: channels });
    const wb = new ExcelJS.Workbook();

    addSheet(wb, 'סקירה', ['מדד', 'ערך'], [
      ['טווח', `${range.fromIso.slice(0, 10)} – ${range.toIso.slice(0, 10)}`],
      ['סה"כ פניות', report.kpis.total],
      ['תלונות', report.kpis.complaints],
      ['נפתרו ע"י הבוט', report.kpis.resolvedByBot],
      ['הוסלמו', report.kpis.escalated],
      ['סנטימנט שלילי', report.kpis.negative],
      ['אחוז שיחות שסווגו', report.coverage.classifiedPct],
      ['אחוז תלונות ששויכו למוצר', report.coverage.complaintsWithProductPct],
      ['אחוז תלונות ששויכו לסדרה', report.series.attributedPct],
    ]);

    addSheet(wb, 'סוגי פנייה', ['סוג', 'כמות', 'תקופה קודמת', 'שינוי'],
      report.inquiryTypes.map((t) => [t.label, t.count, t.previousCount, t.delta]));

    addSheet(wb, 'נושאים', ['נושא', 'כמות', 'תקופה קודמת', 'שינוי'],
      report.topics.map((t) => [t.label, t.count, t.previousCount, t.delta]));

    addSheet(wb, 'תלונות לפי סוג', ['סוג תלונה', 'כמות'],
      report.complaints.byKind.map((c) => [c.label, c.count]));

    addSheet(wb, 'תלונה מול מוצר', ['מוצר', 'תלונות'],
      report.complaints.byProduct.map((c) => [c.productName, c.count]));

    addSheet(wb, 'תלונה מול קטגוריה', ['סוג תלונה', 'קטגוריה', 'כמות'],
      report.complaints.kindByCategory.map((c) => [c.kind, c.category, c.count]));

    addSheet(wb, 'סדרות', ['סדרה', 'אזכורים', 'תלונות', 'שיעור תלונה %', 'מדגם קטן'],
      report.series.byComplaintRate.map((sx) => [
        sx.line, sx.mentions, sx.complaints, sx.complaintRate, sx.belowSampleFloor ? 'כן' : 'לא',
      ]));

    addSheet(wb, 'מוצרים', ['מוצר', 'אזכורים', 'תלונות', 'שיעור תלונה %', 'מדגם קטן'],
      report.products.byComplaintRate.map((p) => [
        p.productName, p.mentions, p.complaints, p.complaintRate, p.belowSampleFloor ? 'כן' : 'לא',
      ]));

    addSheet(wb, 'ערוצים', ['ערוץ', 'כמות', 'מחובר'],
      report.channels.map((c) => [
        CHANNEL_LABEL_HE[c.channel] || c.channel,
        c.count,
        c.connected ? 'כן' : 'לא מחובר',
      ]));

    addSheet(wb, 'מילות מפתח', ['מילה', 'כמות'],
      report.keywords.map((k) => [k.keyword, k.count]));

    if (sp.get('include_messages') === '1') {
      addSheet(wb, 'שיחות', ['תאריך', 'ערוץ', 'סוג פנייה', 'נושא', 'תלונה', 'תקציר'],
        rows.map((r) => [
          r.started_at,
          CHANNEL_LABEL_HE[r.channel] || r.channel,
          INQUIRY_TYPE_LABEL_HE[r.inquiry_type as InquiryType] || r.inquiry_type || '',
          r.topic_label || '',
          r.is_complaint ? 'כן' : 'לא',
          r.summary || '',
        ]));
    }

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="conversations-${range.fromIso.slice(0, 10)}-${range.toIso.slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e: any) {
    console.error('[analytics/conversations/export]', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
