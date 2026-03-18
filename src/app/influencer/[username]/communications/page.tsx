'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CommunicationsList from '@/components/communications/CommunicationsList';

interface Communication {
  id: string;
  brand_name: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  unread_count: number;
  last_message_at?: string;
  last_message_by?: string;
  message_count?: number;
  due_date?: string;
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
      const response = await fetch(
        `/api/influencer/communications?username=${username}`
      );

      if (!response.ok) {
        throw new Error('Failed to load communications');
      }

      const result = await response.json();
      setCommunications(result.communications || []);
    } catch (err) {
      console.error('Error loading communications:', err);
      setError('שגיאה בטעינת התקשורת');
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
      <div className="max-w-6xl mx-auto py-8 px-4 animate-slide-up" style={{ background: 'transparent' }}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 rounded w-1/4" style={{ background: 'rgba(255,255,255,0.03)' }} />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>תקשורת מותגים</h1>
            <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>ניהול כל התקשורת עם המותגים שלך</p>
          </div>
          <button
            onClick={() => router.push(`/influencer/${username}/communications/new`)}
            className="btn-primary px-4 py-2 rounded-xl transition-colors"
          >
            + תקשורת חדשה
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--dash-glass-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>סה"כ</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-text)' }}>{stats.total}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--dash-positive)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>פתוח</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-positive)' }}>{stats.open}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--dash-glass-border)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>סגור</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-text-3)' }}>{stats.closed}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-info)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>פיננסי</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>{stats.financial}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-primary)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>משפטי</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>{stats.legal}</div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--dash-negative)' }}>
            <div className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>בעיות</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--dash-negative)' }}>{stats.issues}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--dash-glass-border)' }}>
          <div className="flex gap-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-xl text-right"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
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
              className="px-4 py-2 rounded-xl text-right"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)', color: 'var(--dash-text)', border: '1px solid' }}
            >
              <option value="all">כל הסטטוסים</option>
              <option value="open">פתוח</option>
              <option value="closed">סגור</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--dash-negative)', background: 'color-mix(in srgb, var(--dash-negative) 10%, transparent)' }}>
            <p className="mb-4" style={{ color: 'var(--dash-negative)' }}>{error}</p>
            <button
              onClick={loadData}
              className="btn-coral px-4 py-2 rounded-xl"
            >
              נסה שוב
            </button>
          </div>
        )}

        {/* Empty State */}
        {!error && communications.length === 0 && (
          <div className="rounded-xl border p-12 text-center" style={{ borderColor: 'var(--dash-glass-border)' }}>
            <div className="text-6xl mb-4">💬</div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--dash-text)' }}>
              אין תקשורת עם מותגים עדיין
            </h3>
            <p className="mb-6" style={{ color: 'var(--dash-text-2)' }}>
              התחל לתקשר עם מותגים כדי לנהל את כל השיחות במקום אחד
            </p>
            <button
              onClick={() => router.push(`/influencer/${username}/communications/new`)}
              className="btn-primary px-6 py-3 rounded-xl transition-colors"
            >
              צור תקשורת ראשונה
            </button>
          </div>
        )}

        {/* Communications List */}
        {!error && communications.length > 0 && (
          <CommunicationsList
            communications={filteredCommunications as any}
            username={username}
          />
        )}
      </div>
    </div>
  );
}
