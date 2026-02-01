'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CommunicationsList from '@/components/communications/CommunicationsList';

interface Communication {
  id: string;
  brand_name: string;
  subject: string;
  category: 'financial' | 'legal' | 'partnership_issue' | 'general';
  status: 'open' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  unread_count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  financial: 'פיננסי',
  legal: 'משפטי',
  partnership_issue: 'בעיות שת"פ',
  general: 'כללי',
};

export default function CommunicationsPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [communications, setCommunications] = useState<Communication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/influencer/communications`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load communications');
      }

      const result = await response.json();
      setCommunications(result.communications || []);
    } catch (err: any) {
      console.error('Error loading communications:', err);
      setError(err.message || 'שגיאה בטעינת התקשורת');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCommunications = communications.filter((comm) => {
    const matchesCategory =
      categoryFilter === 'all' || comm.category === categoryFilter;
    const matchesStatus =
      statusFilter === 'all' || comm.status === statusFilter;
    return matchesCategory && matchesStatus;
  });

  const stats = {
    total: communications.length,
    open: communications.filter((c) => c.status === 'open').length,
    closed: communications.filter((c) => c.status === 'closed').length,
    financial: communications.filter((c) => c.category === 'financial').length,
    legal: communications.filter((c) => c.category === 'legal').length,
    issues: communications.filter((c) => c.category === 'partnership_issue').length,
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">תקשורת מותגים</h1>
          <p className="text-gray-600 mt-2">ניהול כל התקשורת עם המותגים שלך</p>
        </div>
        <button
          onClick={() => router.push(`/influencer/${username}/communications/new`)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + תקשורת חדשה
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">סה"כ</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>

        <div className="bg-white border border-green-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">פתוח</div>
          <div className="text-2xl font-bold text-green-600">{stats.open}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">סגור</div>
          <div className="text-2xl font-bold text-gray-600">{stats.closed}</div>
        </div>

        <div className="bg-white border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">פיננסי</div>
          <div className="text-2xl font-bold text-blue-600">{stats.financial}</div>
        </div>

        <div className="bg-white border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">משפטי</div>
          <div className="text-2xl font-bold text-purple-600">{stats.legal}</div>
        </div>

        <div className="bg-white border border-red-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">בעיות</div>
          <div className="text-2xl font-bold text-red-600">{stats.issues}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex gap-4">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-right"
          >
            <option value="all">כל הקטגוריות</option>
            <option value="financial">פיננסי</option>
            <option value="legal">משפטי</option>
            <option value="partnership_issue">בעיות שת"פ</option>
            <option value="general">כללי</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-right"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="open">פתוח</option>
            <option value="closed">סגור</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* Empty State */}
      {!error && communications.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">💬</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            אין תקשורת עם מותגים עדיין
          </h3>
          <p className="text-gray-600 mb-6">
            התחל לתקשר עם מותגים כדי לנהל את כל השיחות במקום אחד
          </p>
          <button
            onClick={() => router.push(`/influencer/${username}/communications/new`)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            צור תקשורת ראשונה
          </button>
        </div>
      )}

      {/* Communications List */}
      {!error && communications.length > 0 && (
        <CommunicationsList
          communications={filteredCommunications}
          username={username}
        />
      )}
    </div>
  );
}
