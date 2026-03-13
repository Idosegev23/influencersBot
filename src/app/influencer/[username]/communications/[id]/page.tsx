'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CommunicationThread from '@/components/communications/CommunicationThread';

interface Communication {
  id: string;
  brand_name: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
}

export default function CommunicationThreadPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const communicationId = params.id as string;

  const [communication, setCommunication] = useState<Communication | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [communicationId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/influencer/communications/${communicationId}?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load communication');
      }

      const result = await response.json();
      setCommunication(result.communication);
    } catch (err) {
      console.error('Error loading communication:', err);
      setError('שגיאה בטעינת התקשורת');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen animate-slide-up" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
        <div className="max-w-6xl mx-auto py-8 px-4 animate-slide-up">
          <div className="animate-pulse space-y-4">
            <div className="h-8 rounded w-1/4" style={{ background: 'rgba(255,255,255,0.03)' }} />
            <div className="h-96 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !communication) {
    return (
      <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
        <div className="max-w-6xl mx-auto py-8 px-4">
          <div
            className="rounded-xl border p-6 text-center"
            style={{
              borderColor: 'var(--dash-negative)',
              background: 'color-mix(in srgb, var(--dash-negative) 10%, transparent)',
            }}
          >
            <p style={{ color: 'var(--dash-negative)' }}>{error || 'תקשורת לא נמצאה'}</p>
            <button
              onClick={() => router.back()}
              className="btn-coral mt-4 px-4 py-2 rounded-xl"
            >
              חזור
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto py-8 px-4">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => router.push(`/influencer/${username}/communications`)}
            className="flex items-center gap-2 transition-colors"
            style={{ color: 'var(--dash-text-2)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>חזור לתקשורת</span>
          </button>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{communication.subject}</h1>
          <p className="mt-1" style={{ color: 'var(--dash-text-2)' }}>{communication.brand_name}</p>
          <div className="flex gap-2 mt-2">
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--dash-text-2)' }}
            >
              {communication.category}
            </span>
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                background: communication.status === 'open'
                  ? 'color-mix(in srgb, var(--dash-positive) 20%, transparent)'
                  : 'rgba(255,255,255,0.03)',
                color: communication.status === 'open'
                  ? 'var(--dash-positive)'
                  : 'var(--dash-text-2)',
              }}
            >
              {communication.status === 'open' ? 'פתוח' : 'סגור'}
            </span>
          </div>
        </div>

        {/* Thread */}
        <CommunicationThread
          communicationId={communicationId}
          username={username}
          onUpdate={loadData}
        />
      </div>
    </div>
  );
}
