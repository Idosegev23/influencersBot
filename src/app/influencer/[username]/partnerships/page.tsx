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
  const [view, setView] = useState<'overview' | 'library' | 'calendar'>('overview');

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
      const activeCount = partnerships.filter((p: any) => p.status === 'active').length;
      
      setData({
        overview: {
          total_partnerships: partnerships.length,
          active_partnerships: activeCount,
          total_revenue: totalRevenue,
          pending_revenue: 0,
          avg_deal_size: partnerships.length > 0 ? totalRevenue / partnerships.length : 0,
          completion_rate: 0,
        },
        pipeline: [],
        monthly_revenue: [],
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
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
          <div className="h-80 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Back Button */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => router.push(`/influencer/${username}/dashboard`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור לדשבורד</span>
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900">לוח מחוונים - שת"פים</h1>
          <button
            onClick={() => router.push(`/influencer/${username}/partnerships/new`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + הוסף שת"פ חדש
          </button>
        </div>

        {/* View Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setView('overview')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'overview'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            סקירה כללית
          </button>
          <button
            onClick={() => setView('library')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'library'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ספרייה
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'calendar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            לוח שנה
          </button>
        </div>
      </div>

      {/* Overview Cards - Always visible */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">סה"כ שת"פים</div>
          <div className="text-2xl font-bold text-gray-900">
            {data.overview.total_partnerships}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">שת"פים פעילים</div>
          <div className="text-2xl font-bold text-green-600">
            {data.overview.active_partnerships}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הכנסות כוללות</div>
          <div className="text-2xl font-bold text-blue-600">
            ₪{data.overview.total_revenue.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הכנסות צפויות</div>
          <div className="text-2xl font-bold text-purple-600">
            ₪{data.overview.pending_revenue.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">ממוצע עסקה</div>
          <div className="text-2xl font-bold text-orange-600">
            ₪{data.overview.avg_deal_size.toLocaleString('he-IL')}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">שיעור השלמה</div>
          <div className="text-2xl font-bold text-emerald-600">
            {data.overview.completion_rate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Dynamic Content Based on View */}
      {view === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PipelineChart data={data.pipeline} />
            <RevenueChart data={data.monthly_revenue} />
          </div>

          {/* Upcoming Deadlines */}
          {data.upcoming_deadlines.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
                דדליינים קרובים
              </h3>
              <div className="space-y-3">
                {data.upcoming_deadlines.slice(0, 5).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div className="text-right flex-1">
                      <div className="font-medium text-gray-900">{task.title}</div>
                      <div className="text-sm text-gray-500">
                        {task.partnerships?.brand_name}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
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
