'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  MessageCircle,
  Package,
  TrendingUp,
  Users,
  Calendar,
  Copy,
  MousePointer,
  BarChart3,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  getInfluencerByUsername,
  getDailyStats,
  getTopProducts,
  type DailyStats,
  type TopProduct,
} from '@/lib/supabase';

// New accurate analytics shape — matches /api/influencer/[username]/analytics.
// Replaces the legacy AnalyticsSummary which conflated sessions with
// unique visitors and lacked topic distribution.
interface AccurateAnalytics {
  range: { from: string; to: string };
  visits: { total: number; unique: number };
  sessions: { total: number; with_message: number };
  messages: { user: number; assistant: number; total: number };
  avg_user_msgs_per_session: number;
  topics: Record<string, number>;
  conversions: { coupon_copies: number; product_clicks: number };
}

const TOPIC_LABEL: Record<string, string> = {
  shipment_status: 'סטטוס משלוח',
  complaint: 'תלונה / מוצר פגום',
  return_or_exchange: 'החזרה / החלפה',
  support_request: 'פנייה לתמיכה',
  coupon: 'קופונים',
  product_question: 'שאלת מוצר',
  greeting: 'ברכה',
  other: 'אחר',
};

const TOPIC_COLOR: Record<string, string> = {
  shipment_status: '#06b6d4',
  complaint: '#ef4444',
  return_or_exchange: '#f59e0b',
  support_request: '#a855f7',
  coupon: '#22c55e',
  product_question: '#3b82f6',
  greeting: '#94a3b8',
  other: '#6b7280',
};
import { formatNumber } from '@/lib/utils';
import type { Influencer } from '@/types';

type DateRange = '7d' | '14d' | '30d' | '90d';

const dateRangeOptions: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 ימים' },
  { value: '14d', label: '14 ימים' },
  { value: '30d', label: '30 יום' },
  { value: '90d', label: '90 יום' },
];

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [summary, setSummary] = useState<AccurateAnalytics | null>(null);
  const [previousSummary, setPreviousSummary] = useState<AccurateAnalytics | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  // Filters — apply to all metrics, topics, and conversions.
  // refFilter null = "all", otherwise an influencer slug.
  const [refFilter, setRefFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Calculate date ranges
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const days = parseInt(dateRange);
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevEnd.setHours(23, 59, 59, 999);

    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days);
    prevStart.setHours(0, 0, 0, 0);

    return {
      startDate: start,
      endDate: now,
      prevStartDate: prevStart,
      prevEndDate: prevEnd,
    };
  }, [dateRange]);

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        // Load accurate analytics from the new endpoint that distinguishes
        // visits / sessions / unique visitors and bundles topic counts.
        const fetchAnalytics = async (from: Date, to: Date) => {
          const url = new URL(
            `/api/influencer/${encodeURIComponent(username)}/analytics`,
            window.location.origin,
          );
          url.searchParams.set('from', from.toISOString());
          url.searchParams.set('to', to.toISOString());
          if (refFilter) url.searchParams.set('ref', refFilter);
          if (search.trim()) url.searchParams.set('q', search.trim());
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error('analytics fetch failed');
          return res.json() as Promise<AccurateAnalytics>;
        };

        const [summaryData, prevSummaryData, dailyData, topProds] = await Promise.all([
          fetchAnalytics(startDate, endDate),
          fetchAnalytics(prevStartDate, prevEndDate),
          getDailyStats(inf.id, startDate, endDate),
          getTopProducts(inf.id, startDate, endDate, 5),
        ]);

        setSummary(summaryData);
        setPreviousSummary(prevSummaryData);
        setDailyStats(dailyData);
        setTopProducts(topProds);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  // refFilter intentionally re-fires the load; search is debounced
  // separately below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, router, startDate, endDate, prevStartDate, prevEndDate, refFilter]);

  // Debounced search — fire 350ms after the user stops typing.
  useEffect(() => {
    if (!influencer) return;
    const t = setTimeout(() => {
      // Re-trigger the load by setting a no-op state if needed; easier
      // to inline a fetch here mirroring the loadData branch.
      const fetchAnalytics = async (from: Date, to: Date) => {
        const url = new URL(
          `/api/influencer/${encodeURIComponent(username)}/analytics`,
          window.location.origin,
        );
        url.searchParams.set('from', from.toISOString());
        url.searchParams.set('to', to.toISOString());
        if (refFilter) url.searchParams.set('ref', refFilter);
        if (search.trim()) url.searchParams.set('q', search.trim());
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        return res.json() as Promise<AccurateAnalytics>;
      };
      Promise.all([
        fetchAnalytics(startDate, endDate),
        fetchAnalytics(prevStartDate, prevEndDate),
      ]).then(([s, p]) => {
        if (s) setSummary(s);
        if (p) setPreviousSummary(p);
      });
    }, 350);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Calculate change percentages
  const getChange = (current: number, previous: number): { value: number; isPositive: boolean } => {
    if (previous === 0) return { value: current > 0 ? 100 : 0, isPositive: current > 0 };
    const change = ((current - previous) / previous) * 100;
    return { value: Math.abs(Math.round(change)), isPositive: change >= 0 };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: 'transparent' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  if (!influencer || !summary) return null;

  const registry = (((influencer as any)?._rawConfig?.influencer_registry || []) as Array<{
    slug: string;
    display_name?: string;
  }>);

  const visitorsChange = getChange(
    summary.visits.unique,
    previousSummary?.visits.unique || 0,
  );
  const sessionsChange = getChange(
    summary.sessions.with_message,
    previousSummary?.sessions.with_message || 0,
  );
  const userMsgsChange = getChange(
    summary.messages.user,
    previousSummary?.messages.user || 0,
  );
  const couponsChange = getChange(
    summary.conversions.coupon_copies,
    previousSummary?.conversions.coupon_copies || 0,
  );

  // Format dates for chart
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  const chartData = dailyStats.map(d => ({
    ...d,
    date: formatDate(d.date),
  }));

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      {/* Sub-header with date range selector */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-2 animate-slide-up">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
            <BarChart3 className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            אנליטיקס
          </h1>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: 'var(--dash-text-3)' }} />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--dash-glass-border)',
                color: 'var(--dash-text)',
              }}
            >
              {dateRangeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Filters — ref source chips + free-text search. Both narrow
            every metric below: visits, sessions, messages, topics, and
            conversions. */}
        <div className="mb-6 space-y-3">
          {registry.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--dash-text-3)' }}>
                סינון לפי משפיענית:
              </span>
              <button
                onClick={() => setRefFilter(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{
                  background: !refFilter ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                  color: !refFilter ? '#fff' : 'var(--dash-text-2)',
                }}
              >
                הכל
              </button>
              {registry.map((r) => {
                const active = refFilter === r.slug.toLowerCase();
                return (
                  <button
                    key={r.slug}
                    onClick={() => setRefFilter(active ? null : r.slug.toLowerCase())}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                    style={{
                      background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                      color: active ? '#fff' : 'var(--dash-text-2)',
                    }}
                  >
                    {r.display_name || r.slug}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <BarChart3 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--dash-text-3)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='חיפוש בתוך השיחות (לדוגמה "דולף", "החזר")'
              className="flex-1 bg-transparent outline-none text-sm"
              dir="rtl"
              style={{ color: 'var(--dash-text)' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-xs opacity-60 hover:opacity-100"
                style={{ color: 'var(--dash-text-2)' }}
              >
                נקה
              </button>
            )}
          </div>
          {(refFilter || search.trim()) && summary && (
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
              סינון פעיל — {summary.sessions.with_message} שיחות תואמות ב-{dateRange === '7d' ? '7 הימים' : dateRange === '14d' ? '14 הימים' : dateRange === '30d' ? '30 הימים' : '90 הימים'} האחרונים
            </p>
          )}
        </div>

        {/* Summary Stats — accurate counts. "מבקרים ייחודיים" replaces
            the old "שיחות" tile that conflated sessions with visitors;
            sessions are now the more useful "with at least one message"
            count, and messages count user side only. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              icon: <Users className="w-6 h-6 text-cyan-400" />,
              iconBg: 'rgba(6,182,212,0.15)',
              change: visitorsChange,
              value: formatNumber(summary.visits.unique),
              label: 'מבקרים ייחודיים',
              sub: `${formatNumber(summary.visits.total)} ביקורי דף בסך הכל`,
            },
            {
              icon: <MessageCircle className="w-6 h-6 text-blue-400" />,
              iconBg: 'rgba(59,130,246,0.15)',
              change: sessionsChange,
              value: formatNumber(summary.sessions.with_message),
              label: 'שיחות בפועל',
              sub: `מתוך ${formatNumber(summary.sessions.total)} פתיחות צ'אט`,
            },
            {
              icon: <TrendingUp className="w-6 h-6 text-green-400" />,
              iconBg: 'rgba(34,197,94,0.15)',
              change: userMsgsChange,
              value: formatNumber(summary.messages.user),
              label: 'הודעות מלקוחות',
              sub: `ממוצע ${summary.avg_user_msgs_per_session} לשיחה`,
            },
            {
              icon: <Copy className="w-6 h-6 text-purple-400" />,
              iconBg: 'rgba(168,85,247,0.15)',
              change: couponsChange,
              value: formatNumber(summary.conversions.coupon_copies),
              label: 'קופונים הועתקו',
              sub: `${formatNumber(summary.conversions.product_clicks)} קליקים על מוצרים`,
            },
          ].map((card, i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 animate-fade-in"
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderColor: 'var(--dash-glass-border)',
                border: '1px solid'
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: card.iconBg }}
                >
                  {card.icon}
                </div>
                <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full`}
                  style={{
                    background: card.change.isPositive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: card.change.isPositive ? 'var(--dash-positive)' : 'var(--dash-negative)',
                  }}
                >
                  {card.change.isPositive ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {card.change.value}%
                </div>
              </div>
              <p className="text-3xl font-bold mb-1" style={{ color: 'var(--dash-text)' }}>{card.value}</p>
              <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>{card.label}</p>
              {card.sub && (
                <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>
                  {card.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Topic distribution — what customers chat about */}
        {(() => {
          const entries = Object.entries(summary.topics)
            .sort(([, a], [, b]) => (b as number) - (a as number));
          const total = entries.reduce((s, [, n]) => s + (n as number), 0);
          if (total === 0) return null;
          return (
            <div
              className="glass-card rounded-2xl p-6 mb-8 animate-slide-up"
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderColor: 'var(--dash-glass-border)',
                border: '1px solid',
              }}
            >
              <h3 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
                <BarChart3 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                על מה הלקוחות מדברים
              </h3>
              <p className="text-xs mb-5" style={{ color: 'var(--dash-text-3)' }}>
                סיווג לפי ההודעה הראשונה בשיחה ({total} שיחות בטווח)
              </p>
              <div className="space-y-3">
                {entries.map(([topic, count]) => {
                  const pct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                  const color = TOPIC_COLOR[topic] || '#6b7280';
                  const label = TOPIC_LABEL[topic] || topic;
                  return (
                    <div key={topic}>
                      <div className="flex items-center justify-between mb-1.5 text-sm">
                        <span style={{ color: 'var(--dash-text)' }}>{label}</span>
                        <span className="tabular-nums" style={{ color: 'var(--dash-text-2)' }}>
                          {formatNumber(count as number)} <span className="opacity-60">· {pct}%</span>
                        </span>
                      </div>
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Sessions & Messages Chart */}
          <div
            className="glass-card rounded-2xl p-6 animate-slide-up"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'var(--dash-glass-border)',
              border: '1px solid'
            }}
          >
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              שיחות והודעות
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9334EB" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#9334EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--dash-glass-border)" />
                  <XAxis dataKey="date" stroke="var(--dash-text-3)" fontSize={12} />
                  <YAxis stroke="var(--dash-text-3)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--dash-glass-border)',
                      borderRadius: '12px',
                      direction: 'rtl',
                      color: 'var(--dash-text)',
                    }}
                    labelStyle={{ color: 'var(--dash-text)' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    name="שיחות"
                    stroke="#9334EB"
                    fillOpacity={1}
                    fill="url(#colorSessions)"
                  />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    name="הודעות"
                    stroke="#22c55e"
                    fillOpacity={1}
                    fill="url(#colorMessages)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Conversions Chart */}
          <div
            className="glass-card rounded-2xl p-6 animate-slide-up"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'var(--dash-glass-border)',
              border: '1px solid'
            }}
          >
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <Package className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              קופונים וקליקים
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--dash-glass-border)" />
                  <XAxis dataKey="date" stroke="var(--dash-text-3)" fontSize={12} />
                  <YAxis stroke="var(--dash-text-3)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--dash-glass-border)',
                      borderRadius: '12px',
                      direction: 'rtl',
                      color: 'var(--dash-text)',
                    }}
                    labelStyle={{ color: 'var(--dash-text)' }}
                  />
                  <Legend />
                  <Bar dataKey="couponCopies" name="קופונים הועתקו" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="productClicks" name="קליקים על מוצרים" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div
          className="glass-card rounded-2xl p-6 animate-slide-up"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'var(--dash-glass-border)',
            border: '1px solid'
          }}
        >
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
            <Package className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            מוצרים מובילים
          </h3>

          {topProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-sm" style={{ borderBottom: '1px solid var(--dash-glass-border)', color: 'var(--dash-text-2)' }}>
                    <th className="text-right py-3 px-4">#</th>
                    <th className="text-right py-3 px-4">מוצר</th>
                    <th className="text-right py-3 px-4">מותג</th>
                    <th className="text-center py-3 px-4">קליקים</th>
                    <th className="text-center py-3 px-4">קופונים הועתקו</th>
                    <th className="text-center py-3 px-4">סה״כ פעילות</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, index) => (
                    <tr
                      key={product.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--dash-glass-border)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td className="py-4 px-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          index === 1 ? 'bg-gray-400/20 text-gray-300' :
                          index === 2 ? 'bg-orange-500/20 text-orange-400' :
                          ''
                        }`}
                          style={index > 2 ? { background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-3)' } : undefined}
                        >
                          {index + 1}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-medium" style={{ color: 'var(--dash-text)' }}>{product.name}</td>
                      <td className="py-4 px-4" style={{ color: 'var(--dash-text-2)' }}>{product.brand || '-'}</td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-orange-400">
                          <MousePointer className="w-4 h-4" />
                          {product.clicks}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-purple-400">
                          <Copy className="w-4 h-4" />
                          {product.couponCopies}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-full text-sm font-medium">
                          {product.clicks + product.couponCopies}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--dash-text-3)' }} />
              <p style={{ color: 'var(--dash-text-2)' }}>אין נתונים על מוצרים בתקופה זו</p>
            </div>
          )}
        </div>

        {/* Additional Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--dash-surface)',
              border: '1px solid var(--dash-border)',
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
              <span style={{ color: 'var(--dash-text-2)' }}>מבקרים ייחודיים</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>{formatNumber(summary.visits.unique)}</p>
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--dash-surface)',
              border: '1px solid var(--dash-border)',
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle className="w-6 h-6" style={{ color: 'var(--dash-positive)' }} />
              <span style={{ color: 'var(--dash-text-2)' }}>ממוצע הודעות לשיחה</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>{summary.avg_user_msgs_per_session}</p>
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--dash-surface)',
              border: '1px solid var(--dash-border)',
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-orange-400" />
              <span style={{ color: 'var(--dash-text-2)' }}>שיעור המרה</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>
              {summary.sessions.with_message > 0
                ? Math.round((summary.conversions.coupon_copies / summary.sessions.with_message) * 100)
                : 0}%
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>קופונים / שיחות</p>
          </div>
        </div>
      </main>
    </div>
  );
}
