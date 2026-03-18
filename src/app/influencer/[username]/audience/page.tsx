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
      <div
        className="max-w-6xl mx-auto py-8 px-4"
        style={{ background: 'transparent', color: 'var(--dash-text)' }}
      >
        <div className="animate-pulse space-y-8">
          <div className="h-8 rounded w-1/4" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="max-w-6xl mx-auto py-8 px-4"
        style={{ background: 'transparent', color: 'var(--dash-text)' }}
      >
        <div
          className="glass-card rounded-2xl p-6 text-center"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: '1px solid var(--dash-negative)' }}
        >
          <p style={{ color: 'var(--dash-negative)' }}>{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 rounded-xl btn-coral"
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
    <div
      className="max-w-6xl mx-auto py-8 px-4 space-y-8 animate-slide-up"
      style={{ background: 'transparent', color: 'var(--dash-text)' }}
    >
      {/* Back Button */}
      <div className="mb-4">
        <button
          onClick={() => router.push(`/influencer/${username}/dashboard`)}
          className="flex items-center gap-2 transition-colors"
          style={{ color: 'var(--dash-text-2)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור לדשבורד</span>
        </button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>דשבורד התנהגות קהל</h1>
        <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>נתוני פעילות ואנליטיקס של הקהל שלך</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>סה"כ שיחות</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>
            {data.overview.totalConversations}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>הודעות ממוצע לשיחה</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>
            {data.overview.avgMessagesPerSession}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>קופונים הועתקו</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            {data.overview.couponCopiedCount}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>אחוז המרה</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--dash-positive)' }}>
            {data.overview.conversionRate}%
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>משתמשים ייחודיים</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>
            {data.overview.uniqueCouponUsers}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>פניות תמיכה</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>
            {data.overview.supportRequests}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>שביעות רצון</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--dash-positive)' }}>
            {data.overview.satisfactionRate}%
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', border: '1px solid' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>מרוצים / לא מרוצים</div>
          <div className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>
            {data.overview.satisfiedCount} / {data.overview.unsatisfiedCount}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrowthChart data={data.conversationsOverTime.map(d => ({ date: d.date, followers: d.count, growth: 0 }))} />
        <EngagementMetrics
          likesRate={data.overview.conversionRate}
          commentsRate={data.overview.satisfactionRate}
          sharesRate={0}
          savesRate={0}
          reach={data.overview.totalConversations}
          impressions={data.overview.totalMessages}
        />
      </div>

      {/* Demographics (placeholder) */}
      <DemographicsChart ageGroups={[]} gender={[]} locations={[]} />

      {/* Top Content (placeholder) */}
      <TopContent content={[]} />
    </div>
  );
}
