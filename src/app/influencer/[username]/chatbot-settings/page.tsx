/**
 * Chatbot Settings Page - ניהול פרסונת הצ'אטבוט
 * סטטיסטיקות, היסטוריה, בניית פרסונה, קוד הטמעה
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ScrapingProgress from '@/components/scraping/ScrapingProgress';

// ============================================
// Type Definitions
// ============================================

interface Stats {
  totalPosts: number;
  totalComments: number;
  topicsCount: number;
  lastScrape: string | null;
  followers: number;
}

interface JobHistory {
  id: string;
  created_at: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_posts_scraped: number;
  total_comments_scraped: number;
  job_type: string;
}

// ============================================
// Main Component
// ============================================

export default function ChatbotSettingsPage() {
  const params = useParams();
  const username = params.username as string;

  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [accountId, setAccountId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [username]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load account info
      const accountRes = await fetch(`/api/influencer/profile?username=${username}`);
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAccountId(accountData.account?.id || '');
      }

      // Load stats
      await loadStats();

      // Load history
      await loadHistory();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/influencer/chatbot/stats?username=${username}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/influencer/chatbot/history?username=${username}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.jobs || []);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const generateEmbedCode = () => {
    return `<!-- Influencer Chatbot Widget -->
<script src="${window.location.origin}/widget.js"></script>
<script>
  InfluencerChatbot.init({
    username: '${username}',
    theme: 'light',
    position: 'bottom-right'
  });
</script>`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('קוד הועתק ללוח!');
  };

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return 'אף פעם';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `לפני ${diffDays} ימים`;
    if (diffHours > 0) return `לפני ${diffHours} שעות`;
    return 'עכשיו';
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null): string => {
    if (!startedAt || !completedAt) return '-';

    const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    const minutes = Math.floor(duration / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center animate-slide-up"
        style={{ background: 'transparent' }}
      >
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 animate-slide-up"
          style={{ borderColor: 'var(--color-primary)' }}
        ></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-6 animate-slide-up"
      style={{ background: 'transparent', color: 'var(--dash-text)' }}
    >
      <div className="max-w-6xl mx-auto space-y-8 animate-slide-up">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--dash-text)' }}>הגדרות צ'אטבוט</h1>
          <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>ניהול הפרסונה והמידע של הצ'אטבוט שלך</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="פוסטים בבסיס"
            value={stats?.totalPosts || 0}
            icon="📝"
          />
          <StatCard
            title="תגובות נאספו"
            value={stats?.totalComments || 0}
            icon="💬"
          />
          <StatCard
            title="נושאים מזוהים"
            value={stats?.topicsCount || 0}
            icon="🏷️"
          />
          <StatCard
            title="סריקה אחרונה"
            value={formatRelativeTime(stats?.lastScrape || null)}
            icon="🕐"
            isText
          />
        </div>

        {/* Scraping Section */}
        <div
          className="rounded-xl border p-6"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
        >
          <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--dash-text)' }}>בניית פרסונה</h2>

          {!showProgress ? (
            <div className="space-y-4">
              <div
                className="border-r-4 p-4 rounded"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--color-info)' }}
              >
                <p style={{ color: 'var(--dash-text)' }}>
                  <strong>בניית פרסונה מאפס</strong> תארך כ-20-30 דקות ותעבור על 7 שלבים:
                </p>
                <ul className="list-disc list-inside mt-2 text-sm space-y-1" style={{ color: 'var(--dash-text-2)' }}>
                  <li>סריקת 500 פוסטים אחרונים</li>
                  <li>סריקת 7,500 תגובות מהפוסטים המובילים</li>
                  <li>ניתוח פרופיל והאשטגים</li>
                  <li>בניית מפת ידע מקצועית עם Gemini Pro</li>
                </ul>
              </div>

              <button
                onClick={() => setShowProgress(true)}
                className="w-full px-6 py-4 rounded-xl font-bold text-lg transition-all btn-primary"
              >
                התחל בניית פרסונה מחדש
              </button>

              <p className="text-sm text-center" style={{ color: 'var(--dash-text-3)' }}>
                טיפ: עדכונים יומיים רצים אוטומטית בכל לילה ב-02:00
              </p>
            </div>
          ) : (
            <ScrapingProgress
              accountId={accountId}
              username={username}
              onComplete={() => {
                setShowProgress(false);
                loadData();
              }}
            />
          )}
        </div>

        {/* History Section */}
        <div
          className="rounded-xl border p-6"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
        >
          <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--dash-text)' }}>היסטוריית סריקות</h2>

          {history.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--dash-text-3)' }}>
              אין עדיין היסטוריית סריקות. התחל בניית פרסונה ראשונה!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th className="text-right p-3 text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>תאריך</th>
                    <th className="text-right p-3 text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>סטטוס</th>
                    <th className="text-right p-3 text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>סוג</th>
                    <th className="text-right p-3 text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>משך</th>
                    <th className="text-right p-3 text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>תוצאות</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((job) => (
                    <tr
                      key={job.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--dash-glass-border)' }}
                    >
                      <td className="p-3 text-sm">
                        {new Date(job.created_at).toLocaleDateString('he-IL', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="p-3 text-sm" style={{ color: 'var(--dash-text-2)' }}>
                        {job.job_type === 'full_rebuild' ? 'סריקה מלאה' : 'עדכון מהיר'}
                      </td>
                      <td className="p-3 text-sm" style={{ color: 'var(--dash-text-2)' }}>
                        {formatDuration(job.started_at, job.completed_at)}
                      </td>
                      <td className="p-3 text-sm" style={{ color: 'var(--dash-text-2)' }}>
                        {job.total_posts_scraped > 0 && `${job.total_posts_scraped} פוסטים`}
                        {job.total_comments_scraped > 0 && `, ${job.total_comments_scraped} תגובות`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Embed Code Section */}
        <div
          className="rounded-xl border p-6"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
        >
          <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--dash-text)' }}>הטמעת Widget</h2>

          <div className="space-y-4">
            <p style={{ color: 'var(--dash-text-2)' }}>
              העתק את הקוד הבא והטמע אותו באתר האישי שלך כדי להוסיף את הצ'אטבוט:
            </p>

            <div
              className="rounded-xl p-4 font-mono text-sm relative"
              style={{ background: 'var(--dash-bar)', color: 'var(--dash-text)' }}
            >
              <button
                onClick={() => copyToClipboard(generateEmbedCode())}
                className="absolute top-2 left-2 px-3 py-1 rounded text-xs font-sans transition-colors btn-primary"
              >
                העתק
              </button>
              <pre className="mt-8 overflow-x-auto">{generateEmbedCode()}</pre>
            </div>

            <div
              className="border-r-4 p-4 rounded"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--color-info)' }}
            >
              <p className="text-sm" style={{ color: 'var(--dash-text)' }}>
                <strong>קישור ישיר:</strong>{' '}
                <a
                  href={`/chat/${username}`}
                  target="_blank"
                  className="hover:underline font-medium"
                  style={{ color: 'var(--color-info)' }}
                >
                  {window.location.origin}/chat/{username}
                </a>
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--dash-text-3)' }}>
                שתף קישור זה עם העוקבים שלך בסטורי, בביו או בלינקים
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function StatCard({
  title,
  value,
  icon,
  isText = false,
}: {
  title: string;
  value: number | string;
  icon: string;
  isText?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-6 transition-shadow"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm mb-1" style={{ color: 'var(--dash-text-2)' }}>{title}</p>
          <p className={`text-3xl font-bold ${isText ? 'text-base' : ''}`} style={{ color: 'var(--dash-text)' }}>
            {isText ? value : value.toLocaleString('he-IL')}
          </p>
        </div>
        <div className="text-4xl p-3 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    completed: { text: 'הושלם', color: 'bg-green-100 text-green-800 border-green-300' },
    running: { text: 'רץ', color: 'bg-blue-100 text-blue-800 border-blue-300' },
    failed: { text: 'נכשל', color: 'bg-red-100 text-red-800 border-red-300' },
    pending: { text: 'ממתין', color: 'bg-gray-100 text-gray-800 border-gray-300' },
    cancelled: { text: 'בוטל', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      {config.text}
    </span>
  );
}
