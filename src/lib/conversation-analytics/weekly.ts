/**
 * Stage 3: freeze the closed week, persist its insights, and push it.
 *
 * The snapshot is what makes the email and the page agree — both render the
 * same stored payload rather than each recomputing its own version of "last
 * week".
 */

import { supabase } from '@/lib/supabase';
import { buildReport, type ClassificationLite, type ConversationReport } from './aggregate';
import { generateInsights, type GeneratedInsight } from './insights';
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
  generate: (report: ConversationReport) => Promise<GeneratedInsight[]>;
  saveSnapshot: (accountId: string, periodStart: string, periodEnd: string, payload: any) => Promise<void>;
  saveInsights: (accountId: string, insights: GeneratedInsight[]) => Promise<void>;
  sendEmail: (payload: any, accountId: string) => Promise<boolean>;
}

export async function runWeeklyReport(opts: {
  accountId: string;
  now?: Date;
  deps?: Partial<WeeklyDeps>;
}): Promise<{ periodStart: string; periodEnd: string; total: number; insights: number; emailed: boolean }> {
  const now = opts.now ?? new Date();
  const w = lastFullWeek(now);
  const deps: WeeklyDeps = { ...defaultDeps(), ...(opts.deps || {}) } as WeeklyDeps;

  const [current, previous, connected] = await Promise.all([
    deps.fetchRows(opts.accountId, w.startIso, w.endIso),
    deps.fetchPreviousRows(opts.accountId, w.prevStartIso, w.prevEndIso),
    deps.fetchConnectedChannels(opts.accountId),
  ]);

  const report = buildReport({ current, previous, connectedChannels: connected });
  const insights = current.length ? await deps.generate(report) : [];

  const periodStart = w.startIso.slice(0, 10);
  const periodEnd = w.endIso.slice(0, 10);
  const payload = { periodStart, periodEnd, report, insights };

  // Upsert on (account_id, period_start, period_end): re-running a week
  // overwrites its issue rather than stacking duplicates.
  await deps.saveSnapshot(opts.accountId, periodStart, periodEnd, payload);
  if (insights.length) await deps.saveInsights(opts.accountId, insights);

  // Aggregates only — the pushed email never carries conversation bodies.
  const emailed = current.length
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
      .select('session_id, channel, started_at, inquiry_type, topic_raw, is_complaint, complaint_kind, sentiment, outcome, product_id, product_category, keywords, status, conversation_topics(label), widget_products(name_he, name)')
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
      keywords: r.keywords || [],
      status: r.status,
    })) as ClassificationLite[];
  };

  return {
    fetchRows: selectRows,
    fetchPreviousRows: selectRows,

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
evidence: רשימת מחרוזות קצרות עם המספרים עצמם.`,
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

    async saveInsights(accountId, insights) {
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
      const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/influencer/${username}/analytics/conversations?from=${payload.periodStart}&to=${payload.periodEnd}`;
      const r = payload.report;

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif">
          <h2>דוח שיחות שבועי · ${payload.periodStart} – ${payload.periodEnd}</h2>
          <p>${r.kpis.total} פניות · ${r.kpis.complaints} תלונות · ${r.kpis.escalated} הוסלמו</p>
          <p>כיסוי: ${r.coverage.classifiedPct}% מהשיחות סווגו · ${r.coverage.complaintsWithProductPct}% מהתלונות שויכו למוצר</p>
          <h3>תובנות</h3>
          <ul>${payload.insights.map((i: any) => `<li><b>${i.title}</b> — ${i.content}</li>`).join('')}</ul>
          <p><a href="${link}">לדוח המלא</a></p>
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
