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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">הגדרות צ'אטבוט</h1>
          <p className="text-gray-600 mt-2">ניהול הפרסונה והמידע של הצ'אטבוט שלך</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="פוסטים בבסיס"
            value={stats?.totalPosts || 0}
            icon="📝"
            color="blue"
          />
          <StatCard
            title="תגובות נאספו"
            value={stats?.totalComments || 0}
            icon="💬"
            color="green"
          />
          <StatCard
            title="נושאים מזוהים"
            value={stats?.topicsCount || 0}
            icon="🏷️"
            color="purple"
          />
          <StatCard
            title="סריקה אחרונה"
            value={formatRelativeTime(stats?.lastScrape || null)}
            icon="🕐"
            color="orange"
            isText
          />
        </div>

        {/* Scraping Section */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-4">בניית פרסונה</h2>

          {!showProgress ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-gray-700">
                  <strong>בניית פרסונה מאפס</strong> תארך כ-20-30 דקות ותעבור על 7 שלבים:
                </p>
                <ul className="list-disc list-inside mt-2 text-sm text-gray-600 space-y-1">
                  <li>סריקת 500 פוסטים אחרונים</li>
                  <li>סריקת 7,500 תגובות מהפוסטים המובילים</li>
                  <li>ניתוח פרופיל והאשטגים</li>
                  <li>בניית מפת ידע מקצועית עם Gemini Pro</li>
                </ul>
              </div>

              <button
                onClick={() => setShowProgress(true)}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-bold text-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
              >
                🚀 התחל בניית פרסונה מחדש
              </button>

              <p className="text-sm text-gray-500 text-center">
                💡 טיפ: עדכונים יומיים רצים אוטומטית בכל לילה ב-02:00
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
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-4">היסטוריית סריקות</h2>

          {history.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              אין עדיין היסטוריית סריקות. התחל בניית פרסונה ראשונה!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-3 text-sm font-semibold text-gray-700">תאריך</th>
                    <th className="text-right p-3 text-sm font-semibold text-gray-700">סטטוס</th>
                    <th className="text-right p-3 text-sm font-semibold text-gray-700">סוג</th>
                    <th className="text-right p-3 text-sm font-semibold text-gray-700">משך</th>
                    <th className="text-right p-3 text-sm font-semibold text-gray-700">תוצאות</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((job) => (
                    <tr key={job.id} className="border-b hover:bg-gray-50 transition-colors">
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
                      <td className="p-3 text-sm text-gray-600">
                        {job.job_type === 'full_rebuild' ? 'סריקה מלאה' : 'עדכון מהיר'}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {formatDuration(job.started_at, job.completed_at)}
                      </td>
                      <td className="p-3 text-sm text-gray-600">
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
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-4">הטמעת Widget</h2>

          <div className="space-y-4">
            <p className="text-gray-600">
              העתק את הקוד הבא והטמע אותו באתר האישי שלך כדי להוסיף את הצ'אטבוט:
            </p>

            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm relative">
              <button
                onClick={() => copyToClipboard(generateEmbedCode())}
                className="absolute top-2 left-2 px-3 py-1 bg-blue-600 text-white rounded text-xs font-sans hover:bg-blue-700 transition-colors"
              >
                📋 העתק
              </button>
              <pre className="mt-8 overflow-x-auto">{generateEmbedCode()}</pre>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-sm text-gray-700">
                <strong>קישור ישיר:</strong>{' '}
                <a
                  href={`/chat/${username}`}
                  target="_blank"
                  className="text-blue-600 hover:underline font-medium"
                >
                  {window.location.origin}/chat/{username}
                </a>
              </p>
              <p className="text-xs text-gray-600 mt-2">
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
  color,
  isText = false,
}: {
  title: string;
  value: number | string;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
  isText?: boolean;
}) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border-2 border-gray-100 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${isText ? 'text-base' : ''}`}>
            {isText ? value : value.toLocaleString('he-IL')}
          </p>
        </div>
        <div
          className={`text-4xl p-3 rounded-full bg-gradient-to-br ${colorClasses[color]} text-white`}
        >
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
