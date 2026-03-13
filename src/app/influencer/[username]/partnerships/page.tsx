'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PipelineChart } from '@/components/partnerships/PipelineChart';
import { RevenueChart } from '@/components/partnerships/RevenueChart';
import { PartnershipCalendar } from '@/components/partnerships/PartnershipCalendar';
import { PartnershipLibrary } from '@/components/partnerships/PartnershipLibrary';

interface PartnershipDashboardData {
  overview: {
    total_partnerships: number;
    active_partnerships: number;
    total_revenue: number;
    pending_revenue: number;
    avg_deal_size: number;
    completion_rate: number;
  };
  pipeline: Array<{
    status: string;
    count: number;
    total_value: number;
    percentage: number;
  }>;
  monthly_revenue: Array<{
    month: string;
    revenue: number;
    count: number;
  }>;
  upcoming_deadlines: any[];
  partnerships: any[];
  calendar_events: any[];
}

export default function PartnershipsDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [data, setData] = useState<PartnershipDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'library' | 'calendar'>('library');

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get partnerships list
      const response = await fetch(
        `/api/influencer/partnerships?username=${username}&limit=100`
      );

      if (!response.ok) {
        throw new Error('Failed to load data');
      }

      const result = await response.json();

      // Transform data to match expected structure
      const partnerships = result.partnerships || [];
      const totalRevenue = partnerships.reduce((sum: number, p: any) =>
        sum + (p.contract_amount || 0), 0);
      const activeCount = partnerships.filter((p: any) => p.status === 'active' || p.status === 'in_progress').length;
      const completedCount = partnerships.filter((p: any) => p.status === 'completed').length;

      // Build pipeline from actual data
      const statusCounts: Record<string, { count: number; total_value: number }> = {};
      partnerships.forEach((p: any) => {
        if (!statusCounts[p.status]) statusCounts[p.status] = { count: 0, total_value: 0 };
        statusCounts[p.status].count++;
        statusCounts[p.status].total_value += p.contract_amount || p.proposal_amount || 0;
      });
      const pipeline = Object.entries(statusCounts).map(([status, data]) => ({
        status,
        count: data.count,
        total_value: data.total_value,
        percentage: partnerships.length > 0 ? Math.round((data.count / partnerships.length) * 100) : 0,
      }));

      // Build monthly revenue from partnerships with start_date
      const monthlyMap: Record<string, { revenue: number; count: number }> = {};
      partnerships.forEach((p: any) => {
        const date = p.start_date || p.created_at;
        if (!date) return;
        const month = date.substring(0, 7); // YYYY-MM
        if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, count: 0 };
        monthlyMap[month].revenue += p.contract_amount || 0;
        monthlyMap[month].count++;
      });
      const monthly_revenue = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, data]) => ({ month, revenue: data.revenue, count: data.count }));

      // Pending = proposal + negotiation amounts
      const pendingRevenue = partnerships
        .filter((p: any) => ['proposal', 'negotiation', 'contract'].includes(p.status))
        .reduce((sum: number, p: any) => sum + (p.contract_amount || p.proposal_amount || 0), 0);

      setData({
        overview: {
          total_partnerships: partnerships.length,
          active_partnerships: activeCount,
          total_revenue: totalRevenue,
          pending_revenue: pendingRevenue,
          avg_deal_size: partnerships.length > 0 ? Math.round(totalRevenue / partnerships.length) : 0,
          completion_rate: partnerships.length > 0 ? Math.round((completedCount / partnerships.length) * 100) : 0,
        },
        pipeline,
        monthly_revenue,
        upcoming_deadlines: [],
        partnerships: partnerships,
        calendar_events: [],
      });
    } catch (err) {
      setError('שגיאה בטעינת נתונים. נסה שוב מאוחר יותר.');
      console.error('Error loading partnerships data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8" style={{ color: 'var(--dash-text)' }}>
        <div className="animate-pulse space-y-8">
          <div className="h-8 rounded w-1/4 glass-card" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 metric-card" />
            ))}
          </div>
          <div className="h-80 glass-card" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4" style={{ color: 'var(--dash-text)' }}>
        <div className="glass-card p-6 text-center" style={{ borderColor: 'var(--dash-glass-border)' }}>
          <p style={{ color: 'var(--dash-negative)' }}>{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 rounded-xl btn-primary"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8 animate-fade-in" style={{ color: 'var(--dash-text)' }}>
      {/* Back Button */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => router.push(`/influencer/${username}/dashboard`)}
          className="flex items-center gap-2 transition-all duration-300 hover:opacity-75"
          style={{ color: 'var(--dash-text-2)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור לדשבורד</span>
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>שיתופי פעולה</h1>
          <button
            onClick={() => router.push(`/influencer/${username}/partnerships/new`)}
            className="px-3.5 py-1.5 rounded-xl text-sm font-medium btn-primary transition-all duration-300"
          >
            + חדש
          </button>
        </div>

        {/* View Selector */}
        <div className="glass-nav flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--dash-glass-border)' }}>
          {[
            { key: 'library' as const, label: 'ספרייה' },
            { key: 'overview' as const, label: 'סקירה' },
            { key: 'calendar' as const, label: 'לוח שנה' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-all duration-300 ${
                view === tab.key ? 'pill pill-purple' : 'pill pill-neutral'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row — compact */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'סה״כ', value: String(data.overview.total_partnerships), color: 'var(--dash-text)' },
          { label: 'פעילים', value: String(data.overview.active_partnerships), color: 'var(--dash-positive)' },
          { label: 'הכנסות', value: `₪${data.overview.total_revenue.toLocaleString('he-IL')}`, color: 'var(--color-primary)' },
          { label: 'צפוי', value: `₪${data.overview.pending_revenue.toLocaleString('he-IL')}`, color: 'var(--color-info, var(--dash-text-2))' },
          { label: 'ממוצע', value: `₪${data.overview.avg_deal_size.toLocaleString('he-IL')}`, color: 'var(--color-warning, var(--dash-text-2))' },
          { label: 'השלמה', value: `${data.overview.completion_rate}%`, color: 'var(--dash-positive)' },
        ].map(stat => (
          <div key={stat.label} className="metric-card relative z-10 px-3 py-3 text-center transition-all duration-300" style={{ borderColor: 'var(--dash-glass-border)' }}>
            <div className="text-[11px] mb-0.5" style={{ color: 'var(--dash-text-3)' }}>{stat.label}</div>
            <div className="text-lg font-bold truncate" style={{ color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Dynamic Content Based on View */}
      {view === 'overview' && (
        <>
          {data.pipeline.length > 0 || data.monthly_revenue.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up">
              <PipelineChart data={data.pipeline} />
              <RevenueChart data={data.monthly_revenue} />
            </div>
          ) : (
            <div className="glass-card py-12 text-center rounded-2xl" style={{ border: '1px solid var(--dash-glass-border)' }}>
              <p className="text-sm relative z-10" style={{ color: 'var(--dash-text-3)' }}>אין מספיק נתונים להצגת גרפים</p>
            </div>
          )}

          {/* Upcoming Deadlines */}
          {data.upcoming_deadlines.length > 0 && (
            <div className="glass-card p-6" style={{ borderColor: 'var(--dash-glass-border)' }}>
              <h3 className="text-lg font-semibold mb-4 text-right relative z-10" style={{ color: 'var(--dash-text)' }}>
                דדליינים קרובים
              </h3>
              <div className="space-y-3 relative z-10">
                {data.upcoming_deadlines.slice(0, 5).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-xl transition-all duration-300 hover:opacity-80"
                    style={{ border: '1px solid var(--dash-glass-border)' }}
                  >
                    <div className="text-right flex-1">
                      <div className="font-medium" style={{ color: 'var(--dash-text)' }}>{task.title}</div>
                      <div className="text-sm" style={{ color: 'var(--dash-text-3)' }}>
                        {task.partnerships?.brand_name}
                      </div>
                    </div>
                    <div className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
                      {new Date(task.due_date).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'library' && (
        <PartnershipLibrary
          partnerships={data.partnerships}
          username={username}
        />
      )}

      {view === 'calendar' && (
        <PartnershipCalendar events={data.calendar_events} />
      )}
    </div>
  );
}
