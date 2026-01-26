'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DemographicsChart } from '@/components/audience/DemographicsChart';
import { EngagementMetrics } from '@/components/audience/EngagementMetrics';
import { GrowthChart } from '@/components/audience/GrowthChart';
import { TopContent } from '@/components/audience/TopContent';

interface AudienceData {
  overview: {
    totalConversations: number;
    totalMessages: number;
    avgMessagesPerSession: number;
    couponCopiedCount: number;
    uniqueCouponUsers: number;
    conversionRate: number;
    supportRequests: number;
    satisfactionRate: number;
    satisfiedCount: number;
    unsatisfiedCount: number;
  };
  conversationsOverTime: Array<{
    date: string;
    count: number;
  }>;
}

export default function AudiencePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [data, setData] = useState<AudienceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/analytics/audience?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load data');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error loading audience data:', err);
      setError('שגיאה בטעינת נתוני הקהל');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
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
      <div className="mb-4">
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">דשבורד התנהגות קהל</h1>
        <p className="text-gray-600 mt-2">נתוני פעילות ואנליטיקס של הקהל שלך</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">סה"כ שיחות</div>
          <div className="text-2xl font-bold text-gray-900">
            {data.overview.totalConversations}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">הודעות ממוצע לשיחה</div>
          <div className="text-2xl font-bold text-blue-600">
            {data.overview.avgMessagesPerSession}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">קופונים הועתקו</div>
          <div className="text-2xl font-bold text-purple-600">
            {data.overview.couponCopiedCount}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">אחוז המרה</div>
          <div className="text-2xl font-bold text-green-600">
            {data.overview.conversionRate}%
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">משתמשים ייחודיים</div>
          <div className="text-2xl font-bold text-orange-600">
            {data.overview.uniqueCouponUsers}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">פניות תמיכה</div>
          <div className="text-2xl font-bold text-yellow-600">
            {data.overview.supportRequests}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">שביעות רצון</div>
          <div className="text-2xl font-bold text-emerald-600">
            {data.overview.satisfactionRate}%
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">מרוצים / לא מרוצים</div>
          <div className="text-lg font-bold text-gray-900">
            {data.overview.satisfiedCount} / {data.overview.unsatisfiedCount}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrowthChart data={data.conversationsOverTime} />
        <EngagementMetrics
          avgMessages={data.overview.avgMessagesPerSession}
          conversionRate={data.overview.conversionRate}
          satisfactionRate={data.overview.satisfactionRate}
        />
      </div>

      {/* Demographics (placeholder) */}
      <DemographicsChart />

      {/* Top Content (placeholder) */}
      <TopContent />
    </div>
  );
}
