/**
 * Shared analytics summary builder. Reads from analytics_daily_rollup
 * for the past N days, overlays today's live counts from raw tables
 * (because the rollup cron only runs once per day), and returns a
 * dashboard-ready payload. Used by both the admin per-account route
 * and the influencer dashboard's own analytics route.
 *
 * Pass `includeCost: true` to include LLM cost data (admin-only).
 */

import { supabase } from '@/lib/supabase';

export interface DailyPoint {
  date: string;
  visits: number;
  sessions: number;
  leads: number;
  support_tickets: number;
  coupon_copies: number;
  bounce_count: number;
  unique_visitors: number;
  new_visitors: number;
  returning_visitors: number;
  external_exits: number;
  back_to_ig: number;
  back_to_site: number;
  avg_duration_sec: number;
  messages_user: number;
  messages_bot: number;
  conversation_starters: number;
  dynamic_clicks: number;
}

export interface AnalyticsSummary {
  accountId: string;
  days: number;
  series: DailyPoint[];
  totals: Record<string, number>;
  breakdown: {
    ref_source: Array<{ source: string; visits: number }>;
    device: Array<{ device: string; visits: number }>;
  };
  funnel: Array<{ stage: string; count: number }>;
  gsc: {
    top_queries: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    provisioning: { gsc_site_url: string | null; gsc_status: string; gsc_last_fetch: string | null } | null;
  };
  anomalies: any[];
  cost?: { total_usd: number; tokens: number; api_calls: number };
}

const ZERO_DAY = (date: string): DailyPoint => ({
  date,
  visits: 0,
  sessions: 0,
  leads: 0,
  support_tickets: 0,
  coupon_copies: 0,
  bounce_count: 0,
  unique_visitors: 0,
  new_visitors: 0,
  returning_visitors: 0,
  external_exits: 0,
  back_to_ig: 0,
  back_to_site: 0,
  avg_duration_sec: 0,
  messages_user: 0,
  messages_bot: 0,
  conversation_starters: 0,
  dynamic_clicks: 0,
});

const NUMERIC_FIELDS: Array<keyof DailyPoint> = [
  'visits',
  'sessions',
  'leads',
  'support_tickets',
  'coupon_copies',
  'bounce_count',
  'unique_visitors',
  'new_visitors',
  'returning_visitors',
  'external_exits',
  'back_to_ig',
  'back_to_site',
  'messages_user',
  'messages_bot',
  'conversation_starters',
  'dynamic_clicks',
];

function dateRange(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }
  return out;
}

export async function getAccountAnalyticsSummary(opts: {
  accountId: string;
  days: number;
  includeCost?: boolean;
}): Promise<AnalyticsSummary> {
  const { accountId } = opts;
  const days = Math.max(1, Math.min(opts.days, 90));
  const dates = dateRange(days);
  const startDate = dates[0];
  const today = new Date().toISOString().slice(0, 10);

  const { data: rollupRows } = await supabase
    .from('analytics_daily_rollup')
    .select('*')
    .eq('account_id', accountId)
    .gte('date', startDate)
    .lte('date', today);

  const dailyByDate = new Map<string, DailyPoint>();
  for (const d of dates) dailyByDate.set(d, ZERO_DAY(d));

  const refSources = new Map<string, number>();
  const devices = new Map<string, number>();
  for (const r of rollupRows || []) {
    const point = dailyByDate.get(r.date as string);
    if (!point) continue;
    for (const f of NUMERIC_FIELDS) {
      (point as any)[f] += (r as any)[f] ?? 0;
    }
    point.avg_duration_sec = Math.max(point.avg_duration_sec, r.avg_duration_sec || 0);
    const src = r.ref_source || 'direct';
    refSources.set(src, (refSources.get(src) || 0) + (r.visits || 0));
    const dev = r.device || 'unknown';
    devices.set(dev, (devices.get(dev) || 0) + (r.visits || 0));
  }

  const todayStart = new Date(`${today}T00:00:00.000Z`).toISOString();
  const [visitsToday, sessionsToday, eventsToday] = await Promise.all([
    supabase
      .from('chat_visits')
      .select('id, anon_id, is_returning, ref_source, device')
      .eq('account_id', accountId)
      .gte('created_at', todayStart),
    supabase
      .from('chat_sessions')
      .select('id, message_count, duration_sec')
      .eq('account_id', accountId)
      .gte('created_at', todayStart),
    supabase
      .from('events')
      .select('id, type')
      .eq('account_id', accountId)
      .gte('created_at', todayStart),
  ]);

  const liveDay = ZERO_DAY(today);
  if (visitsToday.data) {
    liveDay.visits = visitsToday.data.length;
    liveDay.unique_visitors = new Set(visitsToday.data.map((v) => v.anon_id).filter(Boolean)).size;
    liveDay.new_visitors = visitsToday.data.filter((v) => !v.is_returning).length;
    liveDay.returning_visitors = visitsToday.data.filter((v) => v.is_returning).length;
  }
  if (sessionsToday.data) {
    liveDay.sessions = sessionsToday.data.length;
    liveDay.bounce_count = sessionsToday.data.filter((s) => (s.message_count ?? 0) <= 1).length;
    const durs = sessionsToday.data.map((s) => s.duration_sec || 0).filter((d) => d > 0);
    liveDay.avg_duration_sec = durs.length
      ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length)
      : 0;
  }
  if (eventsToday.data) {
    const counts = new Map<string, number>();
    for (const e of eventsToday.data) counts.set(e.type, (counts.get(e.type) || 0) + 1);
    // chat_message_sent (new client) + message_received (engines) both = user msg
    liveDay.messages_user =
      (counts.get('chat_message_sent') || 0) + (counts.get('message_received') || 0);
    liveDay.messages_bot =
      (counts.get('chat_message_received') || 0) + (counts.get('response_sent') || 0);
    liveDay.leads =
      (counts.get('lead_form_submitted') || 0) +
      (counts.get('meeting_request_submitted') || 0) +
      (counts.get('widget_lead_submitted') || 0);
    liveDay.support_tickets =
      (counts.get('support_ticket_submitted') || 0) + (counts.get('support_started') || 0);
    liveDay.coupon_copies = counts.get('coupon_copied') || 0;
    liveDay.external_exits =
      (counts.get('external_link_clicked') || 0) + (counts.get('link_opened') || 0);
    liveDay.back_to_ig = counts.get('back_to_instagram_clicked') || 0;
    liveDay.back_to_site = counts.get('back_to_website_clicked') || 0;
    liveDay.conversation_starters =
      (counts.get('starter_pill_clicked') || 0) +
      (counts.get('suggestion_pill_clicked') || 0) +
      (counts.get('conversation_starter_clicked') || 0) +
      (counts.get('meeting_pill_clicked') || 0);
    liveDay.dynamic_clicks =
      (counts.get('dynamic_cta_clicked') || 0) +
      (counts.get('product_card_clicked') || 0) +
      (counts.get('product_buy_clicked') || 0) +
      (counts.get('product_clicked') || 0) +
      (counts.get('brand_card_opened') || 0) +
      (counts.get('service_card_opened') || 0) +
      (counts.get('topic_question_clicked') || 0) +
      (counts.get('topic_card_clicked') || 0) +
      (counts.get('case_study_clicked') || 0) +
      (counts.get('reel_clicked') || 0) +
      (counts.get('highlight_clicked') || 0) +
      (counts.get('content_card_clicked') || 0) +
      (counts.get('discovery_category_opened') || 0) +
      (counts.get('quick_action_clicked') || 0) +
      (counts.get('card_clicked') || 0) +
      (counts.get('coupon_revealed') || 0) +
      (counts.get('coupon_redeemed_clicked') || 0);
  }
  dailyByDate.set(today, liveDay);

  const series = dates.map((d) => dailyByDate.get(d)!).filter(Boolean);

  const totals = series.reduce(
    (acc, d) => {
      for (const f of NUMERIC_FIELDS) (acc as any)[f] += (d as any)[f] ?? 0;
      return acc;
    },
    Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, 0])) as Record<string, number>
  );
  const avgDuration = series.length
    ? Math.round(series.reduce((s, d) => s + (d.avg_duration_sec || 0), 0) / series.length)
    : 0;
  const bounceRate = totals.sessions > 0 ? Number(((totals.bounce_count / totals.sessions) * 100).toFixed(1)) : 0;
  totals.avg_duration_sec = avgDuration;
  totals.bounce_rate_pct = bounceRate;

  const gscStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: gscRows } = await supabase
    .from('gsc_query_daily')
    .select('query, clicks, impressions, ctr, position')
    .eq('account_id', accountId)
    .gte('date', gscStart)
    .order('clicks', { ascending: false })
    .limit(20);

  const anomalyStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: anomalies } = await supabase
    .from('analytics_anomalies')
    .select('*')
    .eq('account_id', accountId)
    .is('acknowledged_at', null)
    .gte('detected_on', anomalyStart)
    .order('detected_on', { ascending: false });

  const { data: provisioning } = await supabase
    .from('analytics_provisioning')
    .select('gsc_site_url, gsc_status, gsc_last_fetch')
    .eq('account_id', accountId)
    .maybeSingle();

  const funnel = [
    { stage: 'visits', count: totals.visits },
    { stage: 'sessions', count: totals.sessions },
    { stage: 'engaged', count: Math.max(totals.sessions - totals.bounce_count, 0) },
    { stage: 'leads_or_tickets', count: totals.leads + totals.support_tickets },
  ];

  const result: AnalyticsSummary = {
    accountId,
    days,
    series,
    totals,
    breakdown: {
      ref_source: Array.from(refSources.entries())
        .map(([k, v]) => ({ source: k, visits: v }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 10),
      device: Array.from(devices.entries()).map(([k, v]) => ({ device: k, visits: v })),
    },
    funnel,
    gsc: { top_queries: gscRows || [], provisioning: provisioning || null },
    anomalies: anomalies || [],
  };

  if (opts.includeCost) {
    const { data: cost } = await supabase
      .from('cost_tracking')
      .select('estimated_cost, tokens_used, api_calls, period_start')
      .eq('account_id', accountId)
      .gte('period_start', startDate)
      .lte('period_start', today);
    const costTotal = (cost || []).reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
    const tokensTotal = (cost || []).reduce((s, r) => s + Number(r.tokens_used || 0), 0);
    const callsTotal = (cost || []).reduce((s, r) => s + Number(r.api_calls || 0), 0);
    result.cost = {
      total_usd: Number(costTotal.toFixed(4)),
      tokens: tokensTotal,
      api_calls: callsTotal,
    };
  }

  return result;
}
