'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  ExternalLink,
  LogOut,
  Copy,
  Check,
  Loader2,
  Heart,
  Eye,
  MessageSquare,
  Play,
  Image as ImageIcon,
  Layers,
  ChevronLeft,
  BadgeCheck,
} from 'lucide-react';
import { formatNumber, formatRelativeTime } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────

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

// ─── Sub-components ─────────────────────────────────

function ActivityChart({ data }: { data: { date: string; messages: number }[] }) {
  const recent = data.slice(-21);
  if (!recent.length) return null;
  const max = Math.max(...recent.map((d) => d.messages), 1);

  return (
    <div className="flex items-end gap-[3px] h-20">
      {recent.map((d) => (
        <div key={d.date} className="group relative flex-1 flex items-end">
          <div
            className="w-full rounded-sm transition-colors"
            style={{
              height: `${Math.max((d.messages / max) * 100, 4)}%`,
              background: 'var(--dash-bar)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-bar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dash-bar)'; }}
          />
          <div className="absolute bottom-full mb-2 right-1/2 translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
            <div
              className="text-[11px] px-2 py-1 rounded shadow-lg whitespace-nowrap border"
              style={{
                background: 'var(--dash-bg)',
                color: 'var(--dash-text-2)',
                borderColor: 'var(--dash-border)',
              }}
            >
              {d.date.slice(5)} &middot; {d.messages}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const POST_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Play,
  reel: Play,
  carousel: Layers,
};

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--dash-positive)',
  proposal: 'var(--color-info)',
  contract: 'var(--color-primary)',
  negotiation: 'var(--color-warning)',
  completed: 'var(--dash-text-3)',
  lead: 'var(--dash-text-3)',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  proposal: 'הצעה',
  contract: 'חוזה',
  negotiation: 'מו״מ',
  completed: 'הושלם',
  lead: 'ליד',
};

// ─── Shared section wrapper ─────────────────────────

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{ borderColor: 'var(--dash-border)' }}
    >
      {children}
    </section>
  );
}

function SectionHeader({ title, sub, href, linkText = 'הכל' }: {
  title: string;
  sub?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
      <h2 className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
        {title}
        {sub && <span className="font-normal mr-1" style={{ color: 'var(--dash-text-3)' }}>{sub}</span>}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-xs flex items-center gap-0.5 transition-colors"
          style={{ color: 'var(--dash-text-3)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--dash-text-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--dash-text-3)'; }}
        >
          {linkText} <ChevronLeft className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────

export default function InfluencerDashboardPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        if (!(await authRes.json()).authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }
        const statsRes = await fetch(`/api/influencer/dashboard-stats?username=${username}`);
        if (!statsRes.ok) { router.push(`/influencer/${username}`); return; }
        setData(await statsRes.json());
      } catch (e) {
        console.error('Dashboard load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username, router]);

  const logout = async () => {
    await fetch('/api/influencer/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, action: 'logout' }),
    });
    router.push(`/influencer/${username}`);
  };


  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/chat/${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Loading ──

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dash-bg)' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  if (!data) return null;

  const { influencer, instagram, recentPosts, chat, partnerships, coupons, botKnowledge, analytics } = data;
  const chatLink = typeof window !== 'undefined' ? `${window.location.origin}/chat/${username}` : '';
  const avgSec = analytics.avgResponseTimeMs > 0 ? (analytics.avgResponseTimeMs / 1000).toFixed(1) : null;

  // ── Render ──

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>

      {/* ── Page header ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {influencer.avatar_url ? (
            <img src={influencer.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
              style={{ background: 'var(--dash-surface-hover)', color: 'var(--dash-text-2)' }}
            >
              {influencer.display_name?.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--dash-text)' }}>
              {influencer.display_name}
              {influencer.is_verified && <BadgeCheck className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-info)' }} />}
            </h1>
            <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>@{username}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={copyLink}
            className="h-8 px-2.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
            style={{ color: 'var(--dash-text-2)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--dash-positive)' }} /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'הועתק' : 'לינק'}</span>
          </button>
          <a
            href={chatLink}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-2.5 text-xs rounded-md transition-colors hidden sm:flex items-center gap-1.5"
            style={{ color: 'var(--dash-text-2)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            בוט
          </a>
          {/* Rescan removed — daily cron at 01:00 UTC handles this */}
          <button
            onClick={logout}
            className="h-8 px-2.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
            style={{ color: 'var(--dash-text-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>


      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── Metrics strip ── */}
        <div
          className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden"
          style={{ background: 'var(--dash-border)' }}
        >
          {[
            {
              label: 'עוקבים',
              value: formatNumber(instagram.followers),
              delta: instagram.followersGrowth !== 0 ? instagram.followersGrowth : null,
            },
            { label: 'שיחות', value: formatNumber(chat.totalSessions), sub: `${formatNumber(chat.totalMessages)} הודעות` },
            { label: 'שת״פים', value: partnerships.active, sub: partnerships.total > partnerships.active ? `מתוך ${partnerships.total}` : undefined },
            { label: 'קופונים', value: coupons.active, sub: coupons.totalCopies > 0 ? `${formatNumber(coupons.totalCopies)} העתקות` : undefined },
            { label: 'אנגייג׳מנט', value: `${instagram.avgEngagement}%`, sub: instagram.totalLikes > 0 ? `${formatNumber(instagram.totalLikes)} לייקים` : undefined },
            { label: 'צפיות', value: formatNumber(instagram.totalViews), sub: instagram.scrapedPosts > 0 ? `${instagram.scrapedPosts} פוסטים` : undefined },
          ].map((m, i) => (
            <div key={i} className="p-4 text-center" style={{ background: 'var(--dash-bg)' }}>
              <p className="text-xl sm:text-2xl font-semibold tabular-nums" style={{ color: 'var(--dash-text)' }}>{m.value}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--dash-text-3)' }}>{m.label}</p>
              {'delta' in m && m.delta != null && (
                <p className="text-[11px] mt-0.5" style={{ color: m.delta > 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                  {m.delta > 0 ? '+' : ''}{formatNumber(m.delta)}
                </p>
              )}
              {'sub' in m && m.sub && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--dash-text-3)' }}>{m.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ── Left (3/5) ── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Chat activity */}
            <Section>
              <SectionHeader title="פעילות בוט" sub="30 יום" href={`/influencer/${username}/analytics`} linkText="אנליטיקס" />
              <div className="px-5 grid grid-cols-3 gap-4 pb-4">
                {[
                  { label: 'הודעות נכנסות', value: formatNumber(analytics.messagesReceived) },
                  { label: 'תגובות', value: formatNumber(analytics.responsesSent) },
                  { label: 'זמן תגובה', value: avgSec ? `${avgSec}s` : '—' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--dash-text)' }}>{s.value}</p>
                    <p className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5">
                {analytics.dailyActivity.length > 0 ? (
                  <ActivityChart data={analytics.dailyActivity} />
                ) : (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--dash-text-3)' }}>אין עדיין נתוני פעילות</p>
                )}
              </div>
            </Section>

            {/* Recent posts */}
            <Section>
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>פוסטים אחרונים</h2>
                {Object.keys(instagram.postsByType).length > 0 && (
                  <div className="flex gap-2">
                    {Object.entries(instagram.postsByType).map(([type, count]) => (
                      <span key={type} className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{type} {count}</span>
                    ))}
                  </div>
                )}
              </div>

              {recentPosts.length > 0 ? (
                <div>
                  {recentPosts.map((post, i) => {
                    const Icon = POST_ICON[post.type] || ImageIcon;
                    return (
                      <div
                        key={post.id}
                        className="px-5 py-3 flex items-center gap-3 transition-colors"
                        style={{
                          borderTop: i > 0 ? '1px solid var(--dash-border)' : undefined,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--dash-text-3)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: 'var(--dash-text)' }}>{post.caption || `${post.type} post`}</p>
                          <p className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{formatRelativeTime(post.postedAt)}</p>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] tabular-nums flex-shrink-0" style={{ color: 'var(--dash-text-3)' }}>
                          {post.likes > 0 && <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatNumber(post.likes)}</span>}
                          {post.comments > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{formatNumber(post.comments)}</span>}
                          {post.views > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(post.views)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-5 pb-5 text-xs" style={{ color: 'var(--dash-text-3)' }}>אין פוסטים נסרקים</p>
              )}
            </Section>

            {/* Recent chats */}
            <Section>
              <SectionHeader title="שיחות אחרונות" href={`/influencer/${username}/conversations`} />
              {chat.recentSessions.length > 0 ? (
                <div>
                  {chat.recentSessions.map((s, i) => (
                    <div
                      key={s.id}
                      className="px-5 py-3 flex items-center justify-between transition-colors"
                      style={{ borderTop: i > 0 ? '1px solid var(--dash-border)' : undefined }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--dash-muted)' }}
                        >
                          <Users className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-3)' }} />
                        </div>
                        <span className="text-sm" style={{ color: 'var(--dash-text)' }}>{s.messageCount} הודעות</span>
                      </div>
                      <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{formatRelativeTime(s.createdAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5 text-center">
                  <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>אין עדיין שיחות</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--dash-text-3)' }}>שתפו את הלינק כדי להתחיל</p>
                </div>
              )}
            </Section>
          </div>

          {/* ── Right (2/5) ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Partnerships */}
            <Section>
              <SectionHeader title="שת״פים" href={`/influencer/${username}/partnerships`} linkText="ניהול" />

              {partnerships.totalRevenue > 0 && (
                <div className="mx-5 mb-3 flex items-baseline gap-3">
                  <span className="text-lg font-semibold tabular-nums" style={{ color: 'var(--dash-text)' }}>
                    ₪{formatNumber(partnerships.totalRevenue)}
                  </span>
                  {partnerships.pendingRevenue > 0 && (
                    <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                      + ₪{formatNumber(partnerships.pendingRevenue)} ממתין
                    </span>
                  )}
                </div>
              )}

              {partnerships.list.length > 0 ? (
                <div>
                  {partnerships.list.map((p, i) => (
                    <Link
                      key={p.id}
                      href={`/influencer/${username}/partnerships/${p.id}`}
                      className="px-5 py-3 flex items-center justify-between transition-colors block"
                      style={{ borderTop: i > 0 ? '1px solid var(--dash-border)' : undefined }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--dash-text)' }}>{p.brandName}</p>
                        <p className="text-[11px]" style={{ color: STATUS_COLOR[p.status] || 'var(--dash-text-3)' }}>
                          {STATUS_LABEL[p.status] || p.status}
                        </p>
                      </div>
                      {p.contractAmount > 0 && (
                        <span className="text-sm tabular-nums mr-3" style={{ color: 'var(--dash-text-2)' }}>
                          ₪{formatNumber(p.contractAmount)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>אין עדיין שת"פים</p>
                  <Link
                    href={`/influencer/${username}/partnerships`}
                    className="inline-block mt-2 text-xs transition-colors"
                    style={{ color: 'var(--dash-text-2)' }}
                  >
                    + הוסף שת"פ
                  </Link>
                </div>
              )}
            </Section>

            {/* Coupons */}
            {coupons.list.length > 0 && (
              <Section>
                <SectionHeader title="קופונים" href={`/influencer/${username}/coupons`} />
                <div>
                  {coupons.list.map((c, i) => (
                    <div
                      key={c.id}
                      className="px-5 py-3 flex items-center justify-between"
                      style={{ borderTop: i > 0 ? '1px solid var(--dash-border)' : undefined }}
                    >
                      <div className="min-w-0">
                        <code className="text-sm font-mono" style={{ color: 'var(--dash-text)' }}>{c.code}</code>
                        {c.brandName && <p className="text-[11px] mt-0.5" style={{ color: 'var(--dash-text-3)' }}>{c.brandName}</p>}
                      </div>
                      <div className="text-left text-[11px] tabular-nums" style={{ color: 'var(--dash-text-3)' }}>
                        {c.discountValue > 0 && <p>{c.discountType === 'percentage' ? `${c.discountValue}%` : `₪${c.discountValue}`}</p>}
                        {c.copyCount > 0 && <p>{c.copyCount} העתקות</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Bot status */}
            <Section>
              <SectionHeader title="סטטוס הבוט" href={`/influencer/${username}/manage`} linkText="ניהול" />
              <div className="px-5 pb-5 space-y-2.5">
                {[
                  { label: 'מסמכים', value: formatNumber(botKnowledge.totalDocuments) },
                  { label: 'פרגמנטי ידע', value: formatNumber(botKnowledge.totalChunks) },
                  { label: 'היילייטים', value: formatNumber(instagram.highlightsCount) },
                  {
                    label: 'פרסונה',
                    value: botKnowledge.hasPersona ? (botKnowledge.personaTone || 'מוגדרת') : 'לא הוגדרה',
                    warn: !botKnowledge.hasPersona,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--dash-text-3)' }}>{row.label}</span>
                    <span
                      className="tabular-nums"
                      style={{ color: row.warn ? 'var(--color-warning)' : 'var(--dash-text)' }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Quick nav */}
            <Section>
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>ניווט מהיר</h2>
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
                    className="px-3 py-2.5 text-xs rounded-lg transition-colors text-center"
                    style={{ color: 'var(--dash-text-2)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
}
