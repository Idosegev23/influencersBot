/**
 * Stage 3: freeze the closed week, persist its insights, and push it.
 *
 * The snapshot is what makes the email and the page agree — both render the
 * same stored payload rather than each recomputing its own version of "last
 * week".
 */

import { supabase } from '@/lib/supabase';
import { buildReport, type ClassificationLite, type ConversationReport } from './aggregate';
import { generateInsights, ALLOWED_INSIGHT_TYPES, type GeneratedInsight } from './insights';
import { sendEmail } from '@/lib/email';
import OpenAI from 'openai';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sunday-to-Sunday, the week that closed before `now`. Mid-week this is still
 *  the previous completed week — the running week is never reported. */
export function lastFullWeek(now: Date): {
  startIso: string; endIso: string; prevStartIso: string; prevEndIso: string;
} {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - end.getUTCDay()); // back to the most recent Sunday
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    prevStartIso: new Date(start.getTime() - 7 * DAY_MS).toISOString(),
    prevEndIso: start.toISOString(),
  };
}

export interface WeeklyDeps {
  fetchRows: (accountId: string, fromIso: string, toIso: string) => Promise<ClassificationLite[]>;
  fetchPreviousRows: (accountId: string, fromIso: string, toIso: string) => Promise<ClassificationLite[]>;
  fetchConnectedChannels: (accountId: string) => Promise<string[]>;
  countSessions: (accountId: string, fromIso: string, toIso: string) => Promise<number>;
  generate: (report: ConversationReport) => Promise<GeneratedInsight[]>;
  saveSnapshot: (accountId: string, periodStart: string, periodEnd: string, payload: any) => Promise<void>;
  saveInsights: (accountId: string, insights: GeneratedInsight[], periodStart: string, periodEnd: string) => Promise<void>;
  sendEmail: (payload: any, accountId: string) => Promise<boolean>;
}

export async function runWeeklyReport(opts: {
  accountId: string;
  now?: Date;
  /** Off when replaying past weeks: the snapshots are wanted, ten emails are not. */
  sendEmail?: boolean;
  deps?: Partial<WeeklyDeps>;
}): Promise<{ periodStart: string; periodEnd: string; total: number; insights: number; emailed: boolean }> {
  const now = opts.now ?? new Date();
  const w = lastFullWeek(now);
  const deps: WeeklyDeps = { ...defaultDeps(), ...(opts.deps || {}) } as WeeklyDeps;

  const [current, previous, connected, sessionsInRange, previousSessionsInRange] = await Promise.all([
    deps.fetchRows(opts.accountId, w.startIso, w.endIso),
    deps.fetchPreviousRows(opts.accountId, w.prevStartIso, w.prevEndIso),
    deps.fetchConnectedChannels(opts.accountId),
    deps.countSessions(opts.accountId, w.startIso, w.endIso),
    deps.countSessions(opts.accountId, w.prevStartIso, w.prevEndIso),
  ]);

  const report = buildReport({
    current, previous, connectedChannels: connected,
    sessionsInRange, previousSessionsInRange,
  });
  const insights = current.length ? await deps.generate(report) : [];

  const periodStart = w.startIso.slice(0, 10);
  const periodEnd = w.endIso.slice(0, 10);
  const payload = { periodStart, periodEnd, report, insights };

  // Upsert on (account_id, period_start, period_end): re-running a week
  // overwrites its issue rather than stacking duplicates.
  await deps.saveSnapshot(opts.accountId, periodStart, periodEnd, payload);
  if (insights.length) await deps.saveInsights(opts.accountId, insights, periodStart, periodEnd);

  // Aggregates only — the pushed email never carries conversation bodies.
  const emailed = current.length && opts.sendEmail !== false
    ? await deps.sendEmail({ periodStart, periodEnd, report, insights }, opts.accountId)
    : false;

  return { periodStart, periodEnd, total: current.length, insights: insights.length, emailed };
}

function defaultDeps(): WeeklyDeps {
  let client: OpenAI | null = null;
  const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

  const selectRows = async (accountId: string, fromIso: string, toIso: string) => {
    const { data } = await supabase
      .from('conversation_classifications')
      .select('session_id, channel, started_at, inquiry_type, topic_raw, is_complaint, complaint_kind, sentiment, outcome, product_id, product_category, product_line, keywords, status, conversation_topics(label), widget_products(name_he, name)')
      .eq('account_id', accountId)
      .gte('started_at', fromIso)
      .lt('started_at', toIso);

    return (data || []).map((r: any) => ({
      session_id: r.session_id,
      channel: r.channel,
      started_at: r.started_at,
      inquiry_type: r.inquiry_type,
      topic_label: r.conversation_topics?.label || r.topic_raw || null,
      is_complaint: !!r.is_complaint,
      complaint_kind: r.complaint_kind,
      sentiment: r.sentiment,
      outcome: r.outcome,
      product_id: r.product_id,
      product_name: r.widget_products?.name_he || r.widget_products?.name || null,
      product_category: r.product_category,
      product_line: r.product_line ?? null,
      keywords: r.keywords || [],
      status: r.status,
    })) as ClassificationLite[];
  };

  return {
    fetchRows: selectRows,
    fetchPreviousRows: selectRows,

    async countSessions(accountId, fromIso, toIso) {
      const { count } = await supabase
        .from('chat_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('created_at', fromIso)
        .lt('created_at', toIso);
      return count || 0;
    },

    async fetchConnectedChannels(accountId) {
      const out = ['web'];
      const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).single();
      if ((acc as any)?.config?.whatsapp_cs?.enabled === true) out.push('whatsapp');
      const { count } = await supabase
        .from('ig_graph_connections')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('is_active', true);
      if ((count || 0) > 0) out.push('instagram');
      return out;
    },

    generate(report) {
      return generateInsights(report, {
        callModel: async (summary) => {
          const response = await openai().responses.create({
            model: 'gpt-5.6-luna',
            instructions: `אתה מנתח דוח שבועי של שיחות לקוחות ומחזיר 3 עד 6 תובנות פעולתיות בעברית.

כל תובנה חייבת להישען על מספר מתוך הנתונים. אם אין מספר — אל תחזיר את התובנה.
evidence: רשימת מחרוזות קצרות עם המספרים עצמם.

insight_type חייב להיות אחד מאלה בדיוק: ${ALLOWED_INSIGHT_TYPES.join(', ')}

**אם coverageComparable הוא false — אסור לך להסיק שום מסקנה משינוי בנפח השיחות
או מהשוואה לתקופה הקודמת.** במקרה כזה שתי התקופות סווגו במידה שונה, וכל הפרש
ביניהן משקף את איסוף הנתונים ולא את מה שקרה בפועל. התמקד בהרכב התקופה הנוכחית.`,
            input: JSON.stringify(summary),
            max_output_tokens: 2000,
            reasoning: { effort: 'low' },
            text: {
              format: {
                type: 'json_schema',
                name: 'weekly_insights',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    insights: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          insight_type: { type: 'string' },
                          title: { type: 'string' },
                          content: { type: 'string' },
                          occurrence_count: { type: 'number' },
                          confidence: { type: 'number' },
                          evidence: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['insight_type', 'title', 'content', 'occurrence_count', 'confidence', 'evidence'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['insights'],
                  additionalProperties: false,
                },
              },
            },
          } as any);
          return JSON.parse((response as any).output_text);
        },
      });
    },

    async saveSnapshot(accountId, periodStart, periodEnd, payload) {
      const { error } = await supabase
        .from('conversation_report_snapshots')
        .upsert({ account_id: accountId, period_start: periodStart, period_end: periodEnd, payload },
                { onConflict: 'account_id,period_start,period_end' });
      if (error) throw new Error(`saveSnapshot: ${error.message}`);
    },

    async saveInsights(accountId, insights, periodStart, periodEnd) {
      // Replace this period's insights rather than appending: re-running a week
      // must not stack a second set on top of the first.
      await supabase
        .from('conversation_insights')
        .delete()
        .eq('account_id', accountId)
        .eq('first_seen_at', periodStart)
        .eq('last_seen_at', periodEnd);

      await supabase.from('conversation_insights').insert(
        insights.map((i) => ({
          account_id: accountId,
          insight_type: i.insight_type,
          title: i.title,
          content: i.content,
          examples: i.examples,
          occurrence_count: i.occurrence_count,
          confidence_score: i.confidence_score,
          tags: i.tags,
          // The period the insight DESCRIBES. created_at is when the row was
          // written, which for a backfill is today for every historical week —
          // filtering on it mixes ten weeks into one view.
          first_seen_at: periodStart,
          last_seen_at: periodEnd,
        }))
      );
    },

    async sendEmail(payload, accountId) {
      const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).single();
      const config = (acc as any)?.config || {};
      const to = config.conversation_analytics?.report_email
        || config.escalation?.recipients?.[0]?.email;
      if (!to) return false;

      const username = config.username || '';
      // Same base-URL convention as pipeline/notify: an unset env var must not
      // turn the link into a relative path, which is dead inside an email.
      const appBase = (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');
      const link = `${appBase}/influencer/${username}/analytics/conversations?from=${payload.periodStart}&to=${payload.periodEnd}`;
      const r = payload.report;

      const delta = (now: number, before: number) => {
        const d = now - before;
        if (!d || !before) return '';
        const arrow = d > 0 ? '▲' : '▼';
        return ` <span style="color:${d > 0 ? '#dc2626' : '#059669'}">${arrow}${Math.abs(d)}</span>`;
      };

      const rows = (items: string[]) =>
        items.length ? `<ul style="margin:4px 0 12px;padding-inline-start:20px">${items.join('')}</ul>` : '';

      const topTypes = r.inquiryTypes.slice(0, 5).map((t: any) =>
        `<li>${t.label} — <b>${t.count}</b>${delta(t.count, t.previousCount)}</li>`);

      const risers = r.topics.filter((t: any) => t.delta > 0).slice(0, 5).map((t: any) =>
        `<li>${t.label} — <b>${t.count}</b>${delta(t.count, t.previousCount)}${t.isNew ? ' <i>(חדש)</i>' : ''}</li>`);

      const series = r.series.byComplaintRate.slice(0, 5).map((sx: any) =>
        `<li>${sx.line} — ${sx.complaints}/${sx.mentions} (<b>${sx.complaintRate}%</b>)${sx.belowSampleFloor ? ' <i>(מדגם קטן)</i>' : ''}</li>`);

      const insightList = payload.insights.length
        ? `<ul style="margin:4px 0 12px;padding-inline-start:20px">${payload.insights
            .map((i: any) => `<li><b>${i.title}</b> — ${i.content}</li>`).join('')}</ul>`
        : '<p style="color:#6b7280">אין תובנות מובהקות לשבוע הזה.</p>';

      const html = `
        <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#111">
          <h2 style="margin-bottom:4px">דוח שיחות שבועי</h2>
          <p style="color:#6b7280;margin-top:0">${payload.periodStart} – ${payload.periodEnd}</p>

          <p style="font-size:15px">
            <b>${r.kpis.total}</b> פניות${delta(r.kpis.total, r.kpis.previous.total)} ·
            <b>${r.kpis.complaints}</b> תלונות${delta(r.kpis.complaints, r.kpis.previous.complaints)} ·
            <b>${r.kpis.escalated}</b> הוסלמו${delta(r.kpis.escalated, r.kpis.previous.escalated)}
          </p>

          <h3 style="margin-bottom:2px">תובנות</h3>
          ${insightList}

          <h3 style="margin-bottom:2px">סוגי פנייה מובילים</h3>
          ${rows(topTypes)}

          <h3 style="margin-bottom:2px">נושאים עולים</h3>
          ${risers.length ? rows(risers) : '<p style="color:#6b7280">אין נושא שעלה משמעותית.</p>'}

          <h3 style="margin-bottom:2px">סדרות לפי שיעור תלונה</h3>
          ${series.length ? rows(series) : '<p style="color:#6b7280">אין תלונות המשויכות לסדרה.</p>'}

          <p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:8px">
            כיסוי: ${r.coverage.classifiedPct}% מהשיחות סווגו ·
            ${r.coverage.complaintsWithProductPct}% מהתלונות שויכו למוצר ·
            ${r.series.attributedPct}% שויכו לסדרה
          </p>

          <p><a href="${link}" style="background:#883fe2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">לדוח המלא</a></p>
        </div>`;

      const res = await sendEmail({
        to,
        subject: `דוח שיחות שבועי · ${payload.periodStart} – ${payload.periodEnd}`,
        html,
      });
      return !!(res as any)?.success;
    },
  };
}
