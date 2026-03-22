'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

  function getTypeBadge(type: string) {
    switch (type) {
      case 'lifestyle': return 'לייפסטייל';
      case 'parenting': return 'הורות';
      case 'food': return 'אוכל';
      case 'fashion': return 'אופנה';
      case 'beauty': return 'ביוטי';
      default: return 'כללי';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#2663EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#9334EB]/10 border border-[#9334EB]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#9334EB]">group</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold font-headline text-[#1f2937]">משפיעניות</h1>
            <p className="text-sm text-[#d1d5db]">{influencers.length} משפיעניות במערכת</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/admin/add" className="neon-pill neon-pill-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            הוספת חשבון
          </Link>
          <Link href="/admin/dashboard" className="neon-pill neon-pill-ghost">
            חזרה לדאשבורד
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[#d1d5db] text-[20px]">search</span>
        <input
          type="text"
          placeholder="חיפוש לפי שם או username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="neon-input pr-12 w-full"
        />
      </div>

      {/* Stat summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="neon-stat-card">
          <div className="text-xs text-[#4b5563] mb-1">סה״כ משפיענים</div>
          <div className="text-2xl font-bold text-[#1f2937]">{influencers.length}</div>
        </div>
        <div className="neon-stat-card">
          <div className="text-xs text-[#4b5563] mb-1">IG מחוברים</div>
          <div className="text-2xl font-bold text-[#1f2937]">
            {influencers.filter(i => i.igConnection && !i.igConnection.tokenExpired).length}
          </div>
        </div>
        <div className="neon-stat-card">
          <div className="text-xs text-[#4b5563] mb-1">פרסונה פעילה</div>
          <div className="text-2xl font-bold text-[#1f2937]">
            {influencers.filter(i => i.stats.hasGemini).length}
          </div>
        </div>
      </div>

      {/* Influencers List — horizontal card rows */}
      <div className="flex flex-col gap-3">
        {filteredInfluencers.map((inf) => (
          <div
            key={inf.id}
            className="neon-card px-6 py-4 flex items-center gap-5 cursor-pointer transition-all"
            onClick={() => router.push(`/admin/influencers/${inf.id}`)}
          >
            {/* Avatar placeholder */}
            <div className="w-12 h-12 rounded-full bg-[#2663EB]/15 border border-[#2663EB]/25 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#2663EB] text-[24px]">person</span>
            </div>

            {/* Name + username */}
            <div className="flex flex-col min-w-[160px]">
              <span className="text-sm font-bold text-[#1f2937]">{inf.displayName}</span>
              <span className="text-xs text-[#d1d5db]">@{inf.username}</span>
            </div>

            {/* IG connection status badge */}
            <div className="flex-shrink-0">
              {inf.igConnection ? (
                inf.igConnection.tokenExpired ? (
                  <span className="neon-status-expired inline-flex items-center gap-1 text-xs">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    טוקן פג
                  </span>
                ) : (
                  <span className="neon-status-connected inline-flex items-center gap-1 text-xs">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    IG מחובר
                  </span>
                )
              ) : (
                <span className="neon-status-disconnected inline-flex items-center gap-1 text-xs">
                  <span className="material-symbols-outlined text-[14px]">link_off</span>
                  לא מחובר
                </span>
              )}
            </div>

            {/* Type badge */}
            <span className="neon-pill neon-pill-secondary text-xs flex-shrink-0">
              {getTypeBadge(inf.type)}
            </span>

            {/* Persona status */}
            <div className="flex-shrink-0">
              {inf.stats.hasGemini ? (
                <span className="text-[#9334EB] flex items-center gap-1 text-xs">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  פרסונה
                </span>
              ) : (
                <span className="text-[#d1d5db] flex items-center gap-1 text-xs">
                  <span className="material-symbols-outlined text-[16px]">pending</span>
                  חסר
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-[#4b5563] mr-auto">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">article</span>
                {inf.stats.posts}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">mic</span>
                {inf.stats.transcriptions}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">local_offer</span>
                {inf.stats.coupons}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <Link
                href={`/chat/${inf.username}`}
                className="neon-action-btn"
                title="צפייה בצ׳אט"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
              </Link>
              <button
                onClick={() => copyIgLink(inf.id)}
                className="neon-action-btn"
                title="העתק קישור IG"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copiedLinkId === inf.id ? 'check' : 'link'}
                </span>
              </button>
              <Link
                href={`/admin/chatbot-persona/${inf.id}`}
                className="neon-action-btn"
                title="הגדרות"
              >
                <span className="material-symbols-outlined text-[18px]">settings</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {filteredInfluencers.length === 0 && (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-[64px] text-[#d1d5db]/40 mb-4 block">group_off</span>
          <p className="text-[#4b5563]">לא נמצאו משפיעניות</p>
        </div>
      )}
    </>
  );
}
