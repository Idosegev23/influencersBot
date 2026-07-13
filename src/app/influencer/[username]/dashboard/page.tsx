'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings } from '@/lib/i18n/dashboard';
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

// ─── Shared section wrapper ─────────────────────────

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`glass-card overflow-hidden ${className}`}>
      {children}
    </section>
  );
}

function SectionHeader({ title, sub, href, linkText }: {
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
  const { lang } = useDashboardLang(username);
  const isEn = lang === 'en';
  const t = getDashboardStrings(lang);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'dashboard' | 'leads'>('dashboard');

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
        const dashData = await statsRes.json();
        setData(dashData);
        // Load leads for this account
        if (dashData?.influencer?.id) {
          fetch(`/api/briefs?accountId=${dashData.influencer.id}`)
            .then(r => r.json())
            .then(d => setLeads(d.briefs || []))
            .catch(() => {});
        }
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
          <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{t.dashboard.loadingDashboard}</p>
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
            <span className="hidden sm:inline">{copied ? t.dashboard.linkCopied : t.dashboard.link}</span>
          </button>
          <a
            href={chatLink}
            target="_blank"
            rel="noopener noreferrer"
            className="pill pill-purple text-xs hidden sm:inline-flex transition-all duration-300 hover:scale-[1.02]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t.dashboard.bot}
          </a>
          <button
            onClick={logout}
            className="pill pill-neutral text-xs transition-all duration-300 hover:scale-[1.02]"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>


      {/* ── Tab bar (only if leads exist) ── */}
      {leads.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-3">
          <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--dash-surface)', border: '1px solid var(--dash-glass-border)' }}>
            {[
              { id: 'dashboard' as const, label: t.dashboard.tabDashboard, icon: '📊' },
              { id: 'leads' as const, label: `${t.dashboard.tabLeads} (${leads.length})`, icon: '👥' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className="flex-1 py-2 px-4 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{
                  background: activeView === tab.id ? 'var(--dash-bg)' : 'transparent',
                  color: activeView === tab.id ? 'var(--dash-text)' : 'var(--dash-text-3)',
                  boxShadow: activeView === tab.id ? 'var(--dash-card-shadow)' : 'none',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

      {activeView === 'leads' && leads.length > 0 ? (
        /* ── Leads View ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>{t.dashboard.leadsAndBriefs}</h2>
          </div>
          {leads.map((lead: any) => {
            const leadStatusColors: Record<string, string> = {
              new: '#9334EB',
              contacted: '#2663EB',
              in_progress: '#EA580C',
              closed: '#16A34A',
              archived: '#6b7280',
            };
            const leadLabels = t.dashboard.leadStatus as Record<string, string>;
            const st = {
              label: leadLabels[lead.status] || leadLabels.new,
              color: leadStatusColors[lead.status] || leadStatusColors.new,
            };
            const date = new Date(lead.created_at).toLocaleDateString(isEn ? 'en-US' : 'he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

            return (
              <Section key={lead.id}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm" style={{ color: 'var(--dash-text)' }}>{lead.full_name}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{ color: st.color, background: `${st.color}18` }}
                        >
                          {st.label}
                        </span>
                      </div>
                      {lead.business_name && (
                        <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>{lead.business_name}</p>
                      )}
                      <p className="text-sm font-medium mt-1" style={{ color: 'var(--color-primary, #9334EB)' }}>{lead.service_name}</p>

                      <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="hover:underline">✉ {lead.email}</a>
                        )}
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="hover:underline">📞 {lead.phone}</a>
                        )}
                      </div>

                      <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                        {lead.goal && <p><strong>{t.dashboard.leadGoal}</strong> {lead.goal}</p>}
                        {lead.budget_range && <p><strong>{t.dashboard.leadBudget}</strong> {lead.budget_range}</p>}
                        {lead.product_description && <p><strong>{t.dashboard.leadDescription}</strong> {lead.product_description}</p>}
                        {lead.notes && <p><strong>{t.dashboard.leadNotes}</strong> {lead.notes}</p>}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-shrink-0">
                      <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{date}</span>
                      <select
                        value={lead.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          try {
                            await fetch('/api/briefs', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ briefId: lead.id, status: newStatus }),
                            });
                            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
                          } catch {}
                        }}
                        className="text-xs rounded-xl px-2.5 py-1 focus:outline-none"
                        style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)', border: '1px solid var(--dash-glass-border)' }}
                      >
                        <option value="new">{t.dashboard.leadStatus.new}</option>
                        <option value="contacted">{t.dashboard.leadStatus.contacted}</option>
                        <option value="in_progress">{t.dashboard.leadStatus.in_progress}</option>
                        <option value="closed">{t.dashboard.leadStatus.closed}</option>
                        <option value="archived">{t.dashboard.leadStatus.archived}</option>
                      </select>
                      {lead.drive_file_url && (
                        <a
                          href={lead.drive_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs hover:underline"
                          style={{ color: 'var(--color-primary, #2663EB)' }}
                        >
                          📄 {t.dashboard.viewInDrive}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </Section>
            );
          })}
        </div>
      ) : (
        <>
        {/* ── Metrics strip ── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 stagger-children">
          {[
            {
              label: t.dashboard.followers,
              value: formatNumber(instagram.followers),
              delta: instagram.followersGrowth !== 0 ? instagram.followersGrowth : null,
              fill: 'fill-purple',
              icon: Users,
              iconColor: '#9334EB',
            },
            { label: t.dashboard.conversations, value: formatNumber(chat.totalSessions), sub: `${formatNumber(chat.totalMessages)} ${t.dashboard.messages}`, fill: 'fill-blue', icon: MessageSquare, iconColor: '#2663EB' },
            { label: t.dashboard.partnerships, value: partnerships.active, sub: partnerships.total > partnerships.active ? `${t.dashboard.ofCount} ${partnerships.total}` : undefined, fill: 'fill-coral', icon: Heart, iconColor: '#EA580B' },
            { label: t.dashboard.promotions, value: coupons.active, sub: coupons.totalCopies > 0 ? `${formatNumber(coupons.totalCopies)} ${t.dashboard.copies}` : undefined, fill: 'fill-green', icon: Copy, iconColor: '#17A34A' },
            { label: t.dashboard.engagement, value: `${instagram.avgEngagement}%`, sub: instagram.totalLikes > 0 ? `${formatNumber(instagram.totalLikes)} ${t.dashboard.likes}` : undefined, fill: 'fill-pink', icon: Eye, iconColor: '#DB2877' },
            { label: t.dashboard.views, value: formatNumber(instagram.totalViews), sub: instagram.scrapedPosts > 0 ? `${instagram.scrapedPosts} ${t.dashboard.posts}` : undefined, fill: 'fill-amber', icon: Play, iconColor: '#CB8A04' },
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

            {/* Attribution + Support — quick access for brand-mode accounts
                ((influencer as any)?._rawConfig?.influencer_registry exists) */}
            {Array.isArray((influencer as any)?._rawConfig?.influencer_registry) &&
              (influencer as any)._rawConfig.influencer_registry.length > 0 && (
              <Section>
                <SectionHeader
                  title={t.dashboard.byCreator}
                  sub={t.dashboard.byCreatorSub}
                  href={`/influencer/${username}/attribution`}
                  linkText={t.dashboard.fullReport}
                />
                <div className="px-5 pb-5 relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {((influencer as any)._rawConfig.influencer_registry as Array<{ slug: string; display_name: string }>)
                    .slice(0, 4)
                    .map((item) => (
                      <Link
                        key={item.slug}
                        href={`/influencer/${username}/attribution`}
                        className="rounded-xl p-3 transition-all hover:scale-[1.02]"
                        style={{
                          background: 'var(--dash-muted)',
                          border: '1px solid var(--dash-glass-border)',
                        }}
                      >
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--dash-text)' }}>
                          {item.display_name}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: 'var(--dash-text-3)' }}>
                          {`?ref=${item.slug}`}
                        </p>
                      </Link>
                    ))}
                </div>
              </Section>
            )}

            {/* Support tickets quick view */}
            <Section>
              <SectionHeader
                title={t.dashboard.supportTickets}
                sub={t.dashboard.supportOpen}
                href={`/influencer/${username}/support`}
                linkText={t.dashboard.allTickets}
              />
              <div className="px-5 pb-5 relative z-10">
                <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {t.dashboard.supportTicketsDescription}
                </p>
              </div>
            </Section>

            {/* Chat activity */}
            <Section className="glow-border">
              <SectionHeader
                title={t.dashboard.botActivity}
                sub={t.dashboard.days30}
                href={`/influencer/${username}/analytics`}
                linkText={t.dashboard.analytics}
              />
              <div className="px-5 grid grid-cols-3 gap-4 pb-4 relative z-10">
                {[
                  { label: t.dashboard.inboundMessages, value: formatNumber(analytics.messagesReceived) },
                  { label: t.dashboard.replies, value: formatNumber(analytics.responsesSent) },
                  { label: t.dashboard.responseTime, value: avgSec ? `${avgSec}s` : '—' },
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
                  <p className="text-xs text-center py-6" style={{ color: 'var(--dash-text-3)' }}>{t.dashboard.noActivityData}</p>
                )}
              </div>
            </Section>

            {/* Recent posts */}
            <Section>
              <div className="px-5 pt-5 pb-3 flex items-center justify-between relative z-10">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>{t.dashboard.recentPosts}</h2>
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
                <p className="px-5 pb-5 text-xs relative z-10" style={{ color: 'var(--dash-text-3)' }}>{t.dashboard.noPosts}</p>
              )}
            </Section>

            {/* Recent chats */}
            <Section>
              <SectionHeader title={t.dashboard.recentConversations} href={`/influencer/${username}/conversations`} linkText={t.dashboard.all} />
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
                        <span className="text-sm" style={{ color: 'var(--dash-text)' }}>{s.messageCount} {t.dashboard.messages}</span>
                      </div>
                      <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{formatRelativeTime(s.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5 text-center relative z-10">
                  <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{t.dashboard.noConversations}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--dash-text-3)' }}>{t.dashboard.shareToStart}</p>
                </div>
              )}
            </Section>
          </div>

          {/* ── Right (2/5) ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Partnerships */}
            <Section>
              <SectionHeader title={t.dashboard.partnerships} href={`/influencer/${username}/partnerships`} linkText={t.dashboard.manage} />

              {partnerships.totalRevenue > 0 && (
                <div className="mx-5 mb-3 flex items-baseline gap-3 relative z-10">
                  <span className="text-lg font-bold tabular-nums text-gradient-premium">
                    ₪{formatNumber(partnerships.totalRevenue)}
                  </span>
                  {partnerships.pendingRevenue > 0 && (
                    <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                      + {isEn ? '$' : '₪'}{formatNumber(partnerships.pendingRevenue)} {t.dashboard.pending}
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
                          {(t.dashboard.partnershipStatus as Record<string, string>)[p.status] || p.status}
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
                  <p className="text-xs" style={{ color: 'var(--dash-text-3)' }}>{t.dashboard.noPartnerships}</p>
                  <Link
                    href={`/influencer/${username}/partnerships`}
                    className="pill pill-purple text-xs mt-2 inline-flex transition-all duration-300 hover:scale-[1.02]"
                  >
                    + {t.dashboard.addPartnership}
                  </Link>
                </div>
              )}
            </Section>

            {/* Coupons */}
            {coupons.list.length > 0 && (
              <Section>
                <SectionHeader title={t.dashboard.promotions} href={`/influencer/${username}/coupons`} linkText={t.dashboard.all} />
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
                        {c.copyCount > 0 && <p>{c.copyCount} {t.dashboard.copies}</p>}
                      </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Bot status */}
            <Section>
              <SectionHeader title={t.dashboard.botStatus} href={`/influencer/${username}/chatbot-persona`} linkText={t.dashboard.myBot} />
              <div className="px-5 pb-5 space-y-3 relative z-10">
                {[
                  { label: t.dashboard.documents, value: formatNumber(botKnowledge.totalDocuments) },
                  { label: t.dashboard.knowledgeFragments, value: formatNumber(botKnowledge.totalChunks) },
                  { label: t.dashboard.highlights, value: formatNumber(instagram.highlightsCount) },
                  {
                    label: t.dashboard.persona,
                    value: botKnowledge.hasPersona ? (botKnowledge.personaTone || t.dashboard.personaDefined) : t.dashboard.personaNotDefined,
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
                <h2 className="text-sm font-semibold" style={{ color: 'var(--dash-text)' }}>{t.dashboard.quickNav}</h2>
              </div>
              <div className="px-5 pb-5 grid grid-cols-2 gap-2 relative z-10">
                {[
                  { href: 'partnerships', label: t.dashboard.partnerships, pill: 'pill-purple' },
                  { href: 'coupons', label: t.dashboard.promotions, pill: 'pill-coral' },
                  { href: 'conversations', label: t.dashboard.conversations, pill: 'pill-blue' },
                  { href: 'chatbot-persona', label: t.dashboard.myBot, pill: 'pill-teal' },
                  { href: 'settings', label: t.dashboard.settings, pill: 'pill-neutral' },
                  { href: 'share', label: t.dashboard.qrShare, pill: 'pill-pink' },
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
        </>
      )}
      </main>
    </div>
  );
}
