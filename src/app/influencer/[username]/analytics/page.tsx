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
  getAnalyticsSummary,
  getDailyStats,
  getTopProducts,
  type AnalyticsSummary,
  type DailyStats,
  type TopProduct,
} from '@/lib/supabase';
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
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [previousSummary, setPreviousSummary] = useState<AnalyticsSummary | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

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

        // Load analytics data
        const [summaryData, prevSummaryData, dailyData, topProds] = await Promise.all([
          getAnalyticsSummary(inf.id, startDate, endDate),
          getAnalyticsSummary(inf.id, prevStartDate, prevEndDate),
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
  }, [username, router, startDate, endDate, prevStartDate, prevEndDate]);

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

  const sessionsChange = getChange(summary.totalSessions, previousSummary?.totalSessions || 0);
  const messagesChange = getChange(summary.totalMessages, previousSummary?.totalMessages || 0);
  const couponsChange = getChange(summary.totalCouponCopies, previousSummary?.totalCouponCopies || 0);
  const clicksChange = getChange(summary.totalProductClicks, previousSummary?.totalProductClicks || 0);

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
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              icon: <MessageCircle className="w-6 h-6 text-blue-400" />,
              iconBg: 'rgba(59,130,246,0.15)',
              change: sessionsChange,
              value: formatNumber(summary.totalSessions),
              label: 'שיחות',
            },
            {
              icon: <TrendingUp className="w-6 h-6 text-green-400" />,
              iconBg: 'rgba(34,197,94,0.15)',
              change: messagesChange,
              value: formatNumber(summary.totalMessages),
              label: 'הודעות',
              sub: `ממוצע ${summary.avgMessagesPerSession} לשיחה`,
            },
            {
              icon: <Copy className="w-6 h-6 text-purple-400" />,
              iconBg: 'rgba(168,85,247,0.15)',
              change: couponsChange,
              value: formatNumber(summary.totalCouponCopies),
              label: 'קופונים הועתקו',
            },
            {
              icon: <MousePointer className="w-6 h-6 text-orange-400" />,
              iconBg: 'rgba(249,115,22,0.15)',
              change: clicksChange,
              value: formatNumber(summary.totalProductClicks),
              label: 'קליקים על מוצרים',
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
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
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
                    stroke="#6366f1"
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
            <p className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>{formatNumber(summary.uniqueVisitors)}</p>
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
            <p className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>{summary.avgMessagesPerSession}</p>
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
              {summary.totalSessions > 0
                ? Math.round((summary.totalCouponCopies / summary.totalSessions) * 100)
                : 0}%
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--dash-text-3)' }}>קופונים / שיחות</p>
          </div>
        </div>
      </main>
    </div>
  );
}
