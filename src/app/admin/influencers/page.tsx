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
  ArrowRight,
  Link2,
  Plus,
  Instagram,
} from 'lucide-react';

interface Influencer {
  id: string;
  username: string;
  displayName: string;
  type: string;
  status: string;
  igConnection: {
    username: string;
    isActive: boolean;
    connectedAt: string;
    tokenExpired: boolean;
  } | null;
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
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  function copyIgLink(accountId: string) {
    const link = `${window.location.origin}/api/auth/instagram/connect?accountId=${accountId}`;
    navigator.clipboard.writeText(link);
    setCopiedLinkId(accountId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  }

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
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(160, 148, 224, 0.12)', border: '1px solid rgba(160, 148, 224, 0.18)' }}>
              <Users className="w-6 h-6" style={{ color: '#a094e0' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#ede9f8' }}>משפיעניות</h1>
              <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>{influencers.length} משפיעניות במערכת</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin/add"
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Plus className="w-4 h-4" />
              הוספת חשבון
            </Link>
            <Link
              href="/admin/dashboard"
              className="btn-ghost text-sm"
            >
              חזרה לדאשבורד
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'rgba(237, 233, 248, 0.25)' }} />
          <input
            type="text"
            placeholder="חיפוש לפי שם או username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-input pr-12"
          />
        </div>

        {/* Influencers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInfluencers.map((inf) => (
            <div
              key={inf.id}
              className="admin-card p-6 transition-all cursor-pointer"
              onClick={() => router.push(`/admin/influencers/${inf.id}`)}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold mb-1" style={{ color: '#ede9f8' }}>
                    {inf.displayName}
                  </h3>
                  <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>@{inf.username}</p>
                  {/* IG Connection Badge */}
                  {inf.igConnection ? (
                    <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs" style={{
                      background: inf.igConnection.tokenExpired ? 'rgba(224, 164, 148, 0.1)' : 'rgba(225, 48, 108, 0.1)',
                      border: inf.igConnection.tokenExpired ? '1px solid rgba(224, 164, 148, 0.2)' : '1px solid rgba(225, 48, 108, 0.2)',
                      color: inf.igConnection.tokenExpired ? '#e0a494' : '#E1306C',
                    }}>
                      <Instagram className="w-3 h-3" />
                      <span>{inf.igConnection.tokenExpired ? 'טוקן פג' : 'מחובר'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs" style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      color: 'rgba(237, 233, 248, 0.25)',
                    }}>
                      <Instagram className="w-3 h-3" />
                      <span>לא מחובר</span>
                    </div>
                  )}
                </div>
                {inf.stats.hasGemini ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#5eead4' }} />
                ) : (
                  <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#e0a494' }} />
                )}
              </div>

              {/* Type Badge */}
              <div className="inline-flex">
                <span className="pill pill-purple text-sm mb-4">
                  {inf.type === 'lifestyle' && '🎨 לייפסטייל'}
                  {inf.type === 'parenting' && '👶 הורות'}
                  {inf.type === 'food' && '🍳 אוכל'}
                  {inf.type === 'fashion' && '👗 אופנה'}
                  {inf.type === 'beauty' && '💄 ביוטי'}
                  {!['lifestyle', 'parenting', 'food', 'fashion', 'beauty'].includes(inf.type) && '📱 כללי'}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>פוסטים</div>
                  <div className="font-bold" style={{ color: '#ede9f8' }}>{inf.stats.posts}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>תמלולים</div>
                  <div className="font-bold" style={{ color: '#ede9f8' }}>{inf.stats.transcriptions}</div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                    <MessageCircle className="w-4 h-4" />
                    <span>{inf.stats.coupons} קופונים</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: 'rgba(237, 233, 248, 0.2)' }} />
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <Link
                  href={`/chat/${inf.username}`}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2 text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Eye className="w-4 h-4" />
                  צפייה
                </Link>
                <button
                  onClick={(e) => { e.stopPropagation(); copyIgLink(inf.id); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-xl transition-all"
                  style={{
                    background: copiedLinkId === inf.id ? 'rgba(94, 234, 212, 0.1)' : 'rgba(225, 48, 108, 0.06)',
                    border: copiedLinkId === inf.id ? '1px solid rgba(94, 234, 212, 0.2)' : '1px solid rgba(225, 48, 108, 0.15)',
                    color: copiedLinkId === inf.id ? '#5eead4' : '#ede9f8',
                  }}
                >
                  {copiedLinkId === inf.id ? (
                    <><CheckCircle className="w-4 h-4" /> הועתק!</>
                  ) : (
                    <><Link2 className="w-4 h-4" style={{ color: '#E1306C' }} /> קישור IG</>
                  )}
                </button>
                <Link
                  href={`/admin/chatbot-persona/${inf.id}`}
                  className="btn-ghost flex items-center justify-center gap-1.5 py-2 text-sm px-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Settings className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {filteredInfluencers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(237, 233, 248, 0.15)' }} />
            <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>לא נמצאו משפיעניות</p>
          </div>
        )}
      </div>
    </div>
  );
}
