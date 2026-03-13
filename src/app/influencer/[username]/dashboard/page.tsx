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
  TrendingUp,
  TrendingDown,
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
            className="w-full transition-all duration-300"
            style={{
              height: `${Math.max((d.messages / max) * 100, 4)}%`,
              background: 'linear-gradient(to top, var(--dash-bar), var(--dash-bar-hover))',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--dash-bar-hover)';
              e.currentTarget.style.boxShadow = '0 0 8px var(--dash-glow-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--dash-bar)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <div className="absolute bottom-full mb-2 right-1/2 translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
            <div
              className="text-[11px] px-2.5 py-1.5 rounded-xl whitespace-nowrap backdrop-blur-xl"
              style={{
                background: 'var(--dash-surface)',
                color: 'var(--dash-text-2)',
                border: '1px solid var(--dash-glass-border)',
                boxShadow: 'var(--dash-card-shadow)',
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
    <section className={`glass-card overflow-hidden ${className}`}>
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
    <div className="px-5 pt-5 pb-3 flex items-center justify-between relative z-10">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>
        {title}
        {sub && <span className="font-normal mr-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>{sub}</span>}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-xs flex items-center gap-0.5 transition-all duration-300 rounded-lg px-2 py-1"
          style={{ color: 'var(--dash-text-3)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-primary)';
            e.currentTarget.style.background = 'var(--dash-muted)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--dash-text-3)';
            e.currentTarget.style.background = 'transparent';
          }}
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'transparent' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center animate-pulse" style={{ background: 'var(--dash-surface)' }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
          </div>
          <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>טוען דשבורד...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { influencer, instagram, recentPosts, chat, partnerships, coupons, botKnowledge, analytics } = data;
  const chatLink = typeof window !== 'undefined' ? `${window.location.origin}/chat/${username}` : '';
  const avgSec = analytics.avgResponseTimeMs > 0 ? (analytics.avgResponseTimeMs / 1000).toFixed(1) : null;

  // ── Render ──

  return (
    <div className="min-h-screen" dir="rtl" style={{ color: 'var(--dash-text)' }}>

      {/* ── Page header ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-2 flex items-center justify-between animate-fade-in aurora-bg rounded-2xl mb-2">
        <div className="flex items-center gap-3.5 min-w-0">
          {influencer.avatar_url ? (
            <div className="relative">
              <img src={influencer.avatar_url} alt="" className="w-11 h-11 rounded-2xl object-cover flex-shrink-0" style={{ border: '2px solid var(--dash-glass-border)' }} />
              <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 bg-emerald-400" style={{ borderColor: 'var(--dash-bg)' }} />
            </div>
          ) : (
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)', border: '1px solid var(--dash-glass-border)' }}
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

        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className={`pill ${copied ? 'pill-green' : 'pill-neutral'} text-xs transition-all duration-300 hover:scale-[1.02]`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'הועתק' : 'לינק'}</span>
          </button>
          <a
            href={chatLink}
            target="_blank"
            rel="noopener noreferrer"
            className="pill pill-purple text-xs hidden sm:inline-flex transition-all duration-300 hover:scale-[1.02]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            בוט
          </a>
          <button
            onClick={logout}
            className="pill pill-neutral text-xs transition-all duration-300 hover:scale-[1.02]"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>


      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── Metrics strip ── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 stagger-children">
          {[
            {
              label: 'עוקבים',
              value: formatNumber(instagram.followers),
              delta: instagram.followersGrowth !== 0 ? instagram.followersGrowth : null,
              fill: 'fill-purple',
              icon: Users,
              iconColor: '#a094e0',
            },
            { label: 'שיחות', value: formatNumber(chat.totalSessions), sub: `${formatNumber(chat.totalMessages)} הודעות`, fill: 'fill-blue', icon: MessageSquare, iconColor: '#60a5fa' },
            { label: 'שת״פים', value: partnerships.active, sub: partnerships.total > partnerships.active ? `מתוך ${partnerships.total}` : undefined, fill: 'fill-coral', icon: Heart, iconColor: '#e0a494' },
            { label: 'קופונים', value: coupons.active, sub: coupons.totalCopies > 0 ? `${formatNumber(coupons.totalCopies)} העתקות` : undefined, fill: 'fill-green', icon: Copy, iconColor: '#34d399' },
            { label: 'אנגייג׳מנט', value: `${instagram.avgEngagement}%`, sub: instagram.totalLikes > 0 ? `${formatNumber(instagram.totalLikes)} לייקים` : undefined, fill: 'fill-pink', icon: Eye, iconColor: '#f472b6' },
            { label: 'צפיות', value: formatNumber(instagram.totalViews), sub: instagram.scrapedPosts > 0 ? `${instagram.scrapedPosts} פוסטים` : undefined, fill: 'fill-amber', icon: Play, iconColor: '#fbbf24' },
          ].map((m, i) => (
            <div key={i} className="metric-card text-center animate-slide-up" style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}>
              <div className={`w-8 h-8 rounded-xl mx-auto mb-2 flex items-center justify-center relative z-10 ${m.fill}`}>
                <m.icon className="w-4 h-4" style={{ color: m.iconColor }} />
              </div>
              <p className="text-xl sm:text-2xl font-bold tabular-nums relative z-10" style={{ color: 'var(--dash-text)' }}>{m.value}</p>
              <p className="text-[11px] mt-1 relative z-10" style={{ color: 'var(--dash-text-3)' }}>{m.label}</p>
              {'delta' in m && m.delta != null && (
                <p className="text-[11px] mt-0.5 flex items-center justify-center gap-0.5 relative z-10" style={{ color: m.delta > 0 ? 'var(--dash-positive)' : 'var(--dash-negative)' }}>
                  {m.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {m.delta > 0 ? '+' : ''}{formatNumber(m.delta)}
                </p>
              )}
              {'sub' in m && m.sub && (
                <p className="text-[11px] mt-0.5 relative z-10" style={{ color: 'var(--dash-text-3)' }}>{m.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ── Left (3/5) ── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Chat activity */}
            <Section className="glow-border">
              <SectionHeader title="פעילות בוט" sub="30 יום" href={`/influencer/${username}/analytics`} linkText="אנליטיקס" />
              <div className="px-5 grid grid-cols-3 gap-4 pb-4 relative z-10">
                {[
                  { label: 'הודעות נכנסות', value: formatNumber(analytics.messagesReceived) },
                  { label: 'תגובות', value: formatNumber(analytics.responsesSent) },
                  { label: 'זמן תגובה', value: avgSec ? `${avgSec}s` : '—' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--dash-text)' }}>{s.value}</p>
                    <p className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5 relative z-10">
                {analytics.dailyActivity.length > 0 ? (
                  <ActivityChart data={analytics.dailyActivity} />
                ) : (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--dash-text-3)' }}>אין עדיין נתוני פעילות</p>
                )}
              </div>
            </Section>

            {/* Recent posts */}
            <Section>
              <div className="px-5 pt-5 pb-3 flex items-center justify-between relative z-10">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>פוסטים אחרונים</h2>
                {Object.keys(instagram.postsByType).length > 0 && (
                  <div className="flex gap-2">
                    {Object.entries(instagram.postsByType).map(([type, count]) => (
                      <span key={type} className="pill pill-neutral text-[11px]">{type} {count}</span>
                    ))}
                  </div>
                )}
              </div>

              {recentPosts.length > 0 ? (
                <div className="relative z-10">
                  {recentPosts.map((post, i) => {
                    const Icon = POST_ICON[post.type] || ImageIcon;
                    return (
                      <div key={post.id}>
                        {i > 0 && <div className="glow-line mx-5" />}
                        <div
                          className="px-5 py-3 flex items-center gap-3 transition-all duration-300"
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-3)' }} />
                        </div>
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
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-5 pb-5 text-xs relative z-10" style={{ color: 'var(--dash-text-3)' }}>אין פוסטים נסרקים</p>
              )}
            </Section>

            {/* Recent chats */}
            <Section>
              <SectionHeader title="שיחות אחרונות" href={`/influencer/${username}/conversations`} />
              {chat.recentSessions.length > 0 ? (
                <div className="relative z-10">
                  {chat.recentSessions.map((s, i) => (
                    <div key={s.id}>
                      {i > 0 && <div className="glow-line mx-5" />}
                      <div
                        className="px-5 py-3 flex items-center justify-between transition-all duration-300"
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center"
                          style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}
                        >
                          <Users className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-3)' }} />
                        </div>
                        <span className="text-sm" style={{ color: 'var(--dash-text)' }}>{s.messageCount} הודעות</span>
                      </div>
                      <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{formatRelativeTime(s.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5 text-center relative z-10">
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
                <div className="mx-5 mb-3 flex items-baseline gap-3 relative z-10">
                  <span className="text-lg font-bold tabular-nums text-gradient-premium">
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
                <div className="relative z-10">
                  {partnerships.list.map((p, i) => (
                    <div key={p.id}>
                      {i > 0 && <div className="glow-line mx-5" />}
                      <Link
                        href={`/influencer/${username}/partnerships/${p.id}`}
                        className="px-5 py-3 flex items-center justify-between transition-all duration-300 block"
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dash-surface-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                      <div className="min-w-0">
                        <p className="text-sm truncate font-medium" style={{ color: 'var(--dash-text)' }}>{p.brandName}</p>
                        <p className="text-[11px] font-medium" style={{ color: STATUS_COLOR[p.status] || 'var(--dash-text-3)' }}>
                          {STATUS_LABEL[p.status] || p.status}
                        </p>
                      </div>
                      {p.contractAmount > 0 && (
                        <span className="text-sm tabular-nums mr-3 font-medium" style={{ color: 'var(--dash-text-2)' }}>
                          ₪{formatNumber(p.contractAmount)}
                        </span>
                      )}
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5 relative z-10">
                  <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>אין עדיין שת"פים</p>
                  <Link
                    href={`/influencer/${username}/partnerships`}
                    className="pill pill-purple text-xs mt-2 inline-flex transition-all duration-300 hover:scale-[1.02]"
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
                <div className="relative z-10">
                  {coupons.list.map((c, i) => (
                    <div key={c.id}>
                      {i > 0 && <div className="glow-line mx-5" />}
                      <div
                        className="px-5 py-3 flex items-center justify-between"
                      >
                      <div className="min-w-0">
                        <code className="text-sm font-mono font-semibold" style={{ color: 'var(--dash-text)' }}>{c.code}</code>
                        {c.brandName && <p className="text-[11px] mt-0.5" style={{ color: 'var(--dash-text-3)' }}>{c.brandName}</p>}
                      </div>
                      <div className="text-left text-[11px] tabular-nums" style={{ color: 'var(--dash-text-3)' }}>
                        {c.discountValue > 0 && <p>{c.discountType === 'percentage' ? `${c.discountValue}%` : `₪${c.discountValue}`}</p>}
                        {c.copyCount > 0 && <p>{c.copyCount} העתקות</p>}
                      </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Bot status */}
            <Section>
              <SectionHeader title="סטטוס הבוט" href={`/influencer/${username}/manage`} linkText="ניהול" />
              <div className="px-5 pb-5 space-y-3 relative z-10">
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
                      className="tabular-nums font-medium"
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
              <div className="px-5 pt-5 pb-3 relative z-10">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>ניווט מהיר</h2>
              </div>
              <div className="px-5 pb-5 grid grid-cols-2 gap-2 relative z-10">
                {[
                  { href: 'manage', label: 'ניהול תוכן', pill: 'pill-purple' },
                  { href: 'chatbot-persona', label: 'פרסונת הבוט', pill: 'pill-coral' },
                  { href: 'documents', label: 'מסמכים', pill: 'pill-blue' },
                  { href: 'share', label: 'QR + שיתוף', pill: 'pill-teal' },
                  { href: 'support', label: 'תמיכה', pill: 'pill-pink' },
                  { href: 'settings', label: 'הגדרות', pill: 'pill-neutral' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={`/influencer/${username}/${item.href}`}
                    className={`pill ${item.pill} text-xs justify-center py-2.5 transition-all duration-300 hover:scale-[1.02]`}
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
