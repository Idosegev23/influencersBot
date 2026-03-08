'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MessageCircle,
  Users,
  ExternalLink,
  LogOut,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Heart,
  Eye,
  MessageSquare,
  Play,
  Image as ImageIcon,
  Layers,
  ChevronLeft,
  BadgeCheck,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { formatNumber, formatRelativeTime } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────

interface DashboardData {
  influencer: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
    bio?: string;
    is_verified?: boolean;
    category?: string;
    plan?: string;
  };
  instagram: {
    followers: number;
    following: number;
    totalPosts: number;
    scrapedPosts: number;
    totalLikes: number;
    totalComments: number;
    totalViews: number;
    avgEngagement: number;
    sponsoredPosts: number;
    postsByType: Record<string, number>;
    highlightsCount: number;
    followersTrend: { date: string; followers: number }[];
    followersGrowth: number;
  };
  recentPosts: {
    id: string;
    shortcode: string;
    type: string;
    caption: string;
    likes: number;
    comments: number;
    views: number;
    engagement: number;
    postedAt: string;
    thumbnail?: string;
    isSponsored: boolean;
  }[];
  chat: {
    totalSessions: number;
    totalMessages: number;
    avgMessagesPerSession: number;
    recentSessions: {
      id: string;
      messageCount: number;
      createdAt: string;
      updatedAt: string;
    }[];
  };
  partnerships: {
    total: number;
    active: number;
    totalRevenue: number;
    pendingRevenue: number;
    list: {
      id: string;
      brandName: string;
      status: string;
      contractAmount: number;
      category?: string;
      couponCode?: string;
      startDate?: string;
      endDate?: string;
    }[];
  };
  coupons: {
    total: number;
    active: number;
    totalCopies: number;
    list: {
      id: string;
      code: string;
      brandName?: string;
      discountType: string;
      discountValue: number;
      copyCount: number;
      isActive: boolean;
    }[];
  };
  botKnowledge: {
    totalDocuments: number;
    totalChunks: number;
    docsByType: Record<string, number>;
    hasPersona: boolean;
    personaTone?: string;
  };
  analytics: {
    messagesReceived: number;
    responsesSent: number;
    quickActions: number;
    avgResponseTimeMs: number;
    totalTokens: number;
    dailyActivity: { date: string; messages: number; responses: number }[];
  };
}

// ─── Small components ───────────────────────────────────

function ActivityChart({ data }: { data: { date: string; messages: number }[] }) {
  const recent = data.slice(-21);
  if (recent.length === 0) return null;
  const max = Math.max(...recent.map((d) => d.messages), 1);

  return (
    <div className="flex items-end gap-[3px] h-20 mt-1">
      {recent.map((d) => {
        const pct = (d.messages / max) * 100;
        return (
          <div key={d.date} className="group relative flex-1 flex items-end">
            <div
              className="w-full rounded-sm bg-white/[0.08] group-hover:bg-white/20 transition-colors"
              style={{ height: `${Math.max(pct, 4)}%` }}
            />
            <div className="absolute bottom-full mb-2 right-1/2 translate-x-1/2 hidden group-hover:block z-10">
              <div className="bg-gray-900 text-[11px] text-gray-300 px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10">
                {d.date.slice(5)} &middot; {d.messages}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const POST_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Play,
  reel: Play,
  carousel: Layers,
};

const STATUS_MAP: Record<string, string> = {
  active: 'text-emerald-400',
  proposal: 'text-blue-400',
  contract: 'text-violet-400',
  negotiation: 'text-amber-400',
  completed: 'text-gray-400',
  lead: 'text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  proposal: 'הצעה',
  contract: 'חוזה',
  negotiation: 'מו״מ',
  completed: 'הושלם',
  lead: 'ליד',
};

// ─── Page ───────────────────────────────────────────────

export default function InfluencerDashboardPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        const statsRes = await fetch(`/api/influencer/dashboard-stats?username=${username}`);
        if (!statsRes.ok) {
          router.push(`/influencer/${username}`);
          return;
        }
        setData(await statsRes.json());
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [username, router]);

  const handleLogout = async () => {
    await fetch('/api/influencer/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, action: 'logout' }),
    });
    router.push(`/influencer/${username}`);
  };

  const handleRescan = async () => {
    setRescanning(true);
    setRescanResult(null);
    try {
      const res = await fetch('/api/influencer/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        const d = await res.json();
        setRescanResult(`נמצאו ${d.productsCount || 0} מוצרים ו-${d.contentCount || 0} פריטי תוכן`);
      }
    } catch {
      setRescanResult('שגיאה בסריקה');
    } finally {
      setRescanning(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/chat/${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Loading ────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { influencer, instagram, recentPosts, chat, partnerships, coupons, botKnowledge, analytics } = data;
  const chatLink = typeof window !== 'undefined' ? `${window.location.origin}/chat/${username}` : '';
  const avgResponseSec = analytics.avgResponseTimeMs > 0 ? (analytics.avgResponseTimeMs / 1000).toFixed(1) : null;

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100" dir="rtl">

      {/* ── Header ─────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {influencer.avatar_url ? (
              <img src={influencer.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium flex-shrink-0">
                {influencer.display_name?.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <span className="text-sm font-medium text-white flex items-center gap-1 truncate">
                {influencer.display_name}
                {influencer.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={copyLink}
              className="h-8 px-3 text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'הועתק' : 'לינק בוט'}
            </button>
            <a
              href={chatLink}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors hidden sm:flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              בוט
            </a>
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="h-8 px-3 text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">סריקה</span>
            </button>
            <button
              onClick={handleLogout}
              className="h-8 px-3 text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {rescanResult && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2">
            <p className="text-xs text-emerald-400">{rescanResult}</p>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-in fade-in duration-300">

        {/* ── Top metrics row ──────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-white/[0.04] rounded-xl overflow-hidden">
          {[
            {
              label: 'עוקבים',
              value: formatNumber(instagram.followers),
              sub: instagram.followersGrowth !== 0 ? (
                <span className={instagram.followersGrowth > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {instagram.followersGrowth > 0 ? '+' : ''}{formatNumber(instagram.followersGrowth)}
                </span>
              ) : null,
            },
            {
              label: 'שיחות',
              value: formatNumber(chat.totalSessions),
              sub: <span className="text-gray-500">{formatNumber(chat.totalMessages)} הודעות</span>,
            },
            {
              label: 'שת״פים',
              value: partnerships.active,
              sub: partnerships.total > partnerships.active
                ? <span className="text-gray-500">מתוך {partnerships.total}</span>
                : null,
            },
            {
              label: 'קופונים',
              value: coupons.active,
              sub: coupons.totalCopies > 0
                ? <span className="text-gray-500">{formatNumber(coupons.totalCopies)} העתקות</span>
                : null,
            },
            {
              label: 'אנגייג׳מנט',
              value: `${instagram.avgEngagement}%`,
              sub: instagram.totalLikes > 0
                ? <span className="text-gray-500">{formatNumber(instagram.totalLikes)} לייקים</span>
                : null,
            },
            {
              label: 'צפיות',
              value: formatNumber(instagram.totalViews),
              sub: instagram.scrapedPosts > 0
                ? <span className="text-gray-500">{instagram.scrapedPosts} פוסטים</span>
                : null,
            },
          ].map((m, i) => (
            <div key={i} className="bg-[#0a0a0f] p-4 text-center">
              <p className="text-xl sm:text-2xl font-semibold text-white tracking-tight">{m.value}</p>
              <p className="text-[11px] text-gray-500 mt-1">{m.label}</p>
              {m.sub && <p className="text-[11px] mt-0.5">{m.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Two-column layout ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left column (wider) ── */}
          <div className="lg:col-span-3 space-y-6">

            {/* Chat activity */}
            <section className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 pt-5 pb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-white">פעילות בוט <span className="text-gray-500 font-normal">30 יום</span></h2>
                <Link href={`/influencer/${username}/analytics`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  אנליטיקס מלא
                </Link>
              </div>

              <div className="px-5 grid grid-cols-3 gap-4 pb-4">
                <div>
                  <p className="text-lg font-semibold text-white">{formatNumber(analytics.messagesReceived)}</p>
                  <p className="text-[11px] text-gray-500">הודעות נכנסות</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{formatNumber(analytics.responsesSent)}</p>
                  <p className="text-[11px] text-gray-500">תגובות</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{avgResponseSec ? `${avgResponseSec}s` : '—'}</p>
                  <p className="text-[11px] text-gray-500">זמן תגובה</p>
                </div>
              </div>

              <div className="px-5 pb-5">
                {analytics.dailyActivity.length > 0 ? (
                  <ActivityChart data={analytics.dailyActivity} />
                ) : (
                  <p className="text-xs text-gray-600 text-center py-6">אין עדיין נתוני פעילות</p>
                )}
              </div>
            </section>

            {/* Recent posts */}
            <section className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-white">פוסטים אחרונים</h2>
                {Object.keys(instagram.postsByType).length > 0 && (
                  <div className="flex gap-2">
                    {Object.entries(instagram.postsByType).map(([type, count]) => (
                      <span key={type} className="text-[11px] text-gray-500">{type} {count}</span>
                    ))}
                  </div>
                )}
              </div>

              {recentPosts.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {recentPosts.map((post) => {
                    const Icon = POST_ICON[post.type] || ImageIcon;
                    return (
                      <div key={post.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 truncate">{post.caption || `${post.type} post`}</p>
                          <p className="text-[11px] text-gray-600">{formatRelativeTime(post.postedAt)}</p>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-shrink-0 tabular-nums">
                          {post.likes > 0 && (
                            <span className="flex items-center gap-1">
                              <Heart className="w-3 h-3" />{formatNumber(post.likes)}
                            </span>
                          )}
                          {post.comments > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />{formatNumber(post.comments)}
                            </span>
                          )}
                          {post.views > 0 && (
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />{formatNumber(post.views)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-5 pb-5 text-xs text-gray-600">אין פוסטים נסרקים</p>
              )}
            </section>

            {/* Recent chats */}
            <section className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-white">שיחות אחרונות</h2>
                <Link href={`/influencer/${username}/conversations`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  הכל
                </Link>
              </div>

              {chat.recentSessions.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {chat.recentSessions.map((s) => (
                    <div key={s.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center">
                          <Users className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <span className="text-sm text-gray-300">{s.messageCount} הודעות</span>
                      </div>
                      <span className="text-[11px] text-gray-600">{formatRelativeTime(s.createdAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5 text-center">
                  <p className="text-xs text-gray-600">אין עדיין שיחות</p>
                  <p className="text-[11px] text-gray-700 mt-1">שתפו את הלינק כדי להתחיל</p>
                </div>
              )}
            </section>
          </div>

          {/* ── Right column ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Partnerships */}
            <section className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-white">שת״פים</h2>
                <Link href={`/influencer/${username}/partnerships`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-0.5">
                  ניהול <ChevronLeft className="w-3 h-3" />
                </Link>
              </div>

              {partnerships.totalRevenue > 0 && (
                <div className="mx-5 mb-3 flex items-baseline gap-3">
                  <span className="text-lg font-semibold text-white tabular-nums">₪{formatNumber(partnerships.totalRevenue)}</span>
                  {partnerships.pendingRevenue > 0 && (
                    <span className="text-xs text-gray-500">+ ₪{formatNumber(partnerships.pendingRevenue)} ממתין</span>
                  )}
                </div>
              )}

              {partnerships.list.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {partnerships.list.map((p) => (
                    <Link
                      key={p.id}
                      href={`/influencer/${username}/partnerships/${p.id}`}
                      className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200 truncate">{p.brandName}</p>
                        <p className={`text-[11px] ${STATUS_MAP[p.status] || 'text-gray-500'}`}>
                          {STATUS_LABEL[p.status] || p.status}
                        </p>
                      </div>
                      {p.contractAmount > 0 && (
                        <span className="text-sm text-gray-400 tabular-nums mr-3">₪{formatNumber(p.contractAmount)}</span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <p className="text-xs text-gray-600">אין עדיין שת"פים</p>
                  <Link
                    href={`/influencer/${username}/partnerships`}
                    className="inline-block mt-2 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    + הוסף שת"פ
                  </Link>
                </div>
              )}
            </section>

            {/* Coupons */}
            {coupons.list.length > 0 && (
              <section className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white">קופונים</h2>
                  <Link href={`/influencer/${username}/coupons`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-0.5">
                    הכל <ChevronLeft className="w-3 h-3" />
                  </Link>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {coupons.list.map((c) => (
                    <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <code className="text-sm text-white font-mono">{c.code}</code>
                        {c.brandName && <p className="text-[11px] text-gray-500 mt-0.5">{c.brandName}</p>}
                      </div>
                      <div className="text-left text-[11px] text-gray-500 tabular-nums">
                        {c.discountValue > 0 && (
                          <p>{c.discountType === 'percentage' ? `${c.discountValue}%` : `₪${c.discountValue}`}</p>
                        )}
                        {c.copyCount > 0 && <p>{c.copyCount} העתקות</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Bot knowledge */}
            <section className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-white">סטטוס הבוט</h2>
                <Link href={`/influencer/${username}/manage`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-0.5">
                  ניהול <ChevronLeft className="w-3 h-3" />
                </Link>
              </div>

              <div className="px-5 pb-5 space-y-2.5">
                {[
                  { label: 'מסמכים', value: formatNumber(botKnowledge.totalDocuments) },
                  { label: 'פרגמנטי ידע', value: formatNumber(botKnowledge.totalChunks) },
                  { label: 'היילייטים', value: formatNumber(instagram.highlightsCount) },
                  {
                    label: 'פרסונה',
                    value: botKnowledge.hasPersona ? (botKnowledge.personaTone || 'מוגדרת') : 'לא הוגדרה',
                    highlight: !botKnowledge.hasPersona,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{row.label}</span>
                    <span className={row.highlight ? 'text-amber-400' : 'text-gray-200 tabular-nums'}>{row.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick nav */}
            <section className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-sm font-medium text-white">ניווט מהיר</h2>
              </div>
              <div className="px-5 pb-5 grid grid-cols-2 gap-2">
                {[
                  { href: 'manage', label: 'ניהול תוכן' },
                  { href: 'chatbot-persona', label: 'פרסונת הבוט' },
                  { href: 'documents', label: 'מסמכים' },
                  { href: 'share', label: 'QR + שיתוף' },
                  { href: 'support', label: 'תמיכה' },
                  { href: 'settings', label: 'הגדרות' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={`/influencer/${username}/${item.href}`}
                    className="px-3 py-2.5 text-xs text-gray-400 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors text-center"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
