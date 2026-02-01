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
        `/api/influencer/communications/${communicationId}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load communication');
      }

      const result = await response.json();
      setCommunication(result.communication);
    } catch (err: any) {
      console.error('Error loading communication:', err);
      setError(err.message || 'שגיאה בטעינת התקשורת');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-96 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error || !communication) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error || 'תקשורת לא נמצאה'}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            חזור
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.push(`/influencer/${username}/communications`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור לתקשורת</span>
        </button>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{communication.subject}</h1>
        <p className="text-gray-600 mt-1">{communication.brand_name}</p>
        <div className="flex gap-2 mt-2">
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
            {communication.category}
          </span>
          <span
            className={`text-xs px-2 py-1 rounded ${
              communication.status === 'open'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}
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
  );
}
