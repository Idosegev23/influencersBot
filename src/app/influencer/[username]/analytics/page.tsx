'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
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
  ArrowLeft,
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">חזרה לדאשבורד</span>
              </Link>
              <div className="h-6 w-px bg-gray-700" />
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-indigo-400" />
                אנליטיקס
              </h1>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {dateRangeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-blue-400" />
              </div>
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                sessionsChange.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {sessionsChange.isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {sessionsChange.value}%
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{formatNumber(summary.totalSessions)}</p>
            <p className="text-sm text-gray-400">שיחות</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                messagesChange.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {messagesChange.isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {messagesChange.value}%
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{formatNumber(summary.totalMessages)}</p>
            <p className="text-sm text-gray-400">הודעות</p>
            <p className="text-xs text-gray-500 mt-1">
              ממוצע {summary.avgMessagesPerSession} לשיחה
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Copy className="w-6 h-6 text-purple-400" />
              </div>
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                couponsChange.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {couponsChange.isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {couponsChange.value}%
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{formatNumber(summary.totalCouponCopies)}</p>
            <p className="text-sm text-gray-400">קופונים הועתקו</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <MousePointer className="w-6 h-6 text-orange-400" />
              </div>
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                clicksChange.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {clicksChange.isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {clicksChange.value}%
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{formatNumber(summary.totalProductClicks)}</p>
            <p className="text-sm text-gray-400">קליקים על מוצרים</p>
          </motion.div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Sessions & Messages Chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      direction: 'rtl',
                    }}
                    labelStyle={{ color: '#fff' }}
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
          </motion.div>

          {/* Conversions Chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-400" />
              קופונים וקליקים
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      direction: 'rtl',
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Legend />
                  <Bar dataKey="couponCopies" name="קופונים הועתקו" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="productClicks" name="קליקים על מוצרים" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-400" />
            מוצרים מובילים
          </h3>

          {topProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-gray-400 text-sm border-b border-gray-700">
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
                    <tr key={product.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          index === 1 ? 'bg-gray-400/20 text-gray-300' :
                          index === 2 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-gray-600/20 text-gray-400'
                        }`}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-white font-medium">{product.name}</td>
                      <td className="py-4 px-4 text-gray-400">{product.brand || '-'}</td>
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
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">אין נתונים על מוצרים בתקופה זו</p>
            </div>
          )}
        </motion.div>

        {/* Additional Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8"
        >
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6 text-indigo-400" />
              <span className="text-gray-400">מבקרים ייחודיים</span>
            </div>
            <p className="text-3xl font-bold text-white">{formatNumber(summary.uniqueVisitors)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle className="w-6 h-6 text-green-400" />
              <span className="text-gray-400">ממוצע הודעות לשיחה</span>
            </div>
            <p className="text-3xl font-bold text-white">{summary.avgMessagesPerSession}</p>
          </div>

          <div className="bg-gradient-to-br from-orange-600/20 to-red-600/20 border border-orange-500/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-orange-400" />
              <span className="text-gray-400">שיעור המרה</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {summary.totalSessions > 0 
                ? Math.round((summary.totalCouponCopies / summary.totalSessions) * 100)
                : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">קופונים / שיחות</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}








