'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, 
  CheckCircle, 
  AlertCircle, 
  Search,
  Eye,
  MessageCircle,
  BarChart3,
  Settings,
  ArrowRight
} from 'lucide-react';

interface Influencer {
  id: string;
  username: string;
  displayName: string;
  type: string;
  status: string;
  stats: {
    posts: number;
    transcriptions: number;
    coupons: number;
    hasGemini: boolean;
  };
}

export default function InfluencersListPage() {
  const router = useRouter();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadInfluencers();
  }, []);

  async function loadInfluencers() {
    try {
      const res = await fetch('/api/admin/influencers');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setInfluencers(data.influencers || []);
    } catch (error) {
      console.error('Error loading influencers:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredInfluencers = influencers.filter(inf => 
    inf.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inf.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="text-white">טוען...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">משפיעניות</h1>
              <p className="text-gray-400 text-sm">{influencers.length} משפיעניות במערכת</p>
            </div>
          </div>

          <Link
            href="/admin/dashboard"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            חזרה לדאשבורד
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם או username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-12 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Influencers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInfluencers.map((inf) => (
            <div
              key={inf.id}
              className="admin-card p-6 hover:border-indigo-500/50 transition-all cursor-pointer"
              onClick={() => router.push(`/admin/influencers/${inf.id}`)}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {inf.displayName}
                  </h3>
                  <p className="text-gray-400 text-sm">@{inf.username}</p>
                </div>
                {inf.stats.hasGemini ? (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                )}
              </div>

              {/* Type Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-sm mb-4">
                {inf.type === 'lifestyle' && '🎨 לייפסטייל'}
                {inf.type === 'parenting' && '👶 הורות'}
                {inf.type === 'food' && '🍳 אוכל'}
                {inf.type === 'fashion' && '👗 אופנה'}
                {inf.type === 'beauty' && '💄 ביוטי'}
                {!['lifestyle', 'parenting', 'food', 'fashion', 'beauty'].includes(inf.type) && '📱 כללי'}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">פוסטים</div>
                  <div className="text-white font-bold">{inf.stats.posts}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">תמלולים</div>
                  <div className="text-white font-bold">{inf.stats.transcriptions}</div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <MessageCircle className="w-4 h-4" />
                    <span>{inf.stats.coupons} קופונים</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
                <Link
                  href={`/chat/${inf.username}`}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Eye className="w-4 h-4" />
                  צפייה
                </Link>
                <Link
                  href={`/admin/chatbot-persona/${inf.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Settings className="w-4 h-4" />
                  הגדרות
                </Link>
              </div>
            </div>
          ))}
        </div>

        {filteredInfluencers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">לא נמצאו משפיעניות</p>
          </div>
        )}
      </div>
    </div>
  );
}
