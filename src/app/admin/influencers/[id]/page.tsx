'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  MessageCircle, 
  Settings, 
  BarChart3,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye
} from 'lucide-react';

interface InfluencerDetails {
  id: string;
  username: string;
  displayName: string;
  type: string;
  status: string;
  persona: {
    name: string;
    tone: string;
    instagramUsername: string | null;
    hasGemini: boolean;
    productsCount: number;
    brandsCount: number;
    couponsInGemini: number;
  };
  stats: {
    posts: number;
    transcriptions: number;
    coupons: number;
    partnerships: number;
    websites: number;
  };
  chatConfig: {
    greeting: string;
    questions: string[];
    theme: {
      primary: string;
      background: string;
    };
  };
}

export default function InfluencerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const [influencer, setInfluencer] = useState<InfluencerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    loadInfluencer();
  }, [id]);

  async function loadInfluencer() {
    try {
      const res = await fetch(`/api/admin/influencers/${id}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setInfluencer(data.influencer);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function rebuildPersona() {
    if (!confirm('לבנות מחדש את הפרסונה? (לוקח כ-2 דקות)')) return;
    
    setRebuilding(true);
    try {
      const res = await fetch('/api/persona/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id })
      });
      
      if (res.ok) {
        alert('הפרסונה נבנתה מחדש בהצלחה!');
        loadInfluencer();
      } else {
        alert('שגיאה בבניית הפרסונה');
      }
    } catch (error) {
      alert('שגיאה בבניית הפרסונה');
    } finally {
      setRebuilding(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="text-white">טוען...</div>
      </div>
    );
  }

  if (!influencer) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <div className="text-white text-xl mb-2">משפיענית לא נמצאה</div>
          <Link href="/admin/influencers" className="text-indigo-400 hover:underline">
            חזרה לרשימה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/influencers"
            className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{influencer.displayName}</h1>
            <p className="text-gray-400">@{influencer.username}</p>
          </div>
          <div className="mr-auto flex gap-2">
            <Link
              href={`/chat/${influencer.username}`}
              target="_blank"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              צפייה בצ'אט
            </Link>
            <Link
              href={`/admin/chatbot-persona/${id}`}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              הגדרות פרסונה
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Persona Status */}
            <div className="admin-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">סטטוס הפרסונה</h2>
                <button
                  onClick={rebuildPersona}
                  disabled={rebuilding}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
                  {rebuilding ? 'בונה...' : 'בניה מחדש'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg ${influencer.persona.hasGemini ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {influencer.persona.hasGemini ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    <span className="text-white font-medium">Gemini Output</span>
                  </div>
                  <p className={influencer.persona.hasGemini ? 'text-green-300 text-sm' : 'text-red-300 text-sm'}>
                    {influencer.persona.hasGemini ? 'קיים ✓' : 'חסר - יש לבנות'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${influencer.persona.instagramUsername ? 'bg-green-500/10 border border-green-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {influencer.persona.instagramUsername ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                    )}
                    <span className="text-white font-medium">Instagram Username</span>
                  </div>
                  <p className={influencer.persona.instagramUsername ? 'text-green-300 text-sm' : 'text-yellow-300 text-sm'}>
                    {influencer.persona.instagramUsername || 'לא מוגדר'}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">מוצרים</div>
                  <div className="text-white text-2xl font-bold">{influencer.persona.productsCount}</div>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">מותגים</div>
                  <div className="text-white text-2xl font-bold">{influencer.persona.brandsCount}</div>
                </div>
              </div>
            </div>

            {/* Content Stats */}
            <div className="admin-card p-6">
              <h2 className="text-xl font-bold text-white mb-4">תוכן</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">פוסטים</div>
                  <div className="text-white text-2xl font-bold">{influencer.stats.posts}</div>
                </div>
                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">תמלולים</div>
                  <div className="text-white text-2xl font-bold">{influencer.stats.transcriptions}</div>
                </div>
                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">אתרים</div>
                  <div className="text-white text-2xl font-bold">{influencer.stats.websites}</div>
                </div>
              </div>
            </div>

            {/* Commerce */}
            <div className="admin-card p-6">
              <h2 className="text-xl font-bold text-white mb-4">מסחר</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">קופונים (DB)</div>
                  <div className="text-white text-2xl font-bold">{influencer.stats.coupons}</div>
                </div>
                <div className="p-4 rounded-lg bg-gray-800/50">
                  <div className="text-gray-400 text-sm mb-1">שיתופי פעולה</div>
                  <div className="text-white text-2xl font-bold">{influencer.stats.partnerships}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - 1 column */}
          <div className="space-y-6">
            {/* Chat Config */}
            <div className="admin-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">הגדרות צ'אט</h2>
              
              <div className="mb-4">
                <div className="text-gray-400 text-sm mb-2">הודעת פתיחה</div>
                <div className="text-white text-sm bg-gray-800/50 rounded-lg p-3">
                  {influencer.chatConfig.greeting || 'לא מוגדרת'}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-gray-400 text-sm mb-2">שאלות מוכנות</div>
                <div className="space-y-2">
                  {influencer.chatConfig.questions.map((q, i) => (
                    <div key={i} className="text-white text-sm bg-gray-800/50 rounded-lg p-2">
                      {i + 1}. {q}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-gray-400 text-sm mb-2">ערכת צבעים</div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">ראשי</div>
                    <div
                      className="h-10 rounded-lg"
                      style={{ backgroundColor: influencer.chatConfig.theme.primary }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">רקע</div>
                    <div
                      className="h-10 rounded-lg border border-gray-700"
                      style={{ backgroundColor: influencer.chatConfig.theme.background }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="admin-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">פעולות</h2>
              <div className="space-y-2">
                <Link
                  href={`/manage/123456?account=${id}`}
                  className="block w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-center transition-colors"
                >
                  דף ניהול
                </Link>
                <Link
                  href={`/api/process/start?accountId=${id}`}
                  className="block w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-center transition-colors"
                >
                  תמלול מלא
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
