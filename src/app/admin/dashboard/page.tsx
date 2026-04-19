'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  MessagesSquare,
  Globe,
  Activity,
  UserPlus,
  ListChecks,
  ArrowUpRight,
  Plus,
  Sparkles,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Settings2,
  ChevronLeft,
} from 'lucide-react';
import type { Influencer } from '@/types';
import { formatNumber } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/image-utils';

import { PageHeader } from '@/components/admin/PageHeader';
import { KpiCard } from '@/components/admin/KpiCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar } from '@/components/ui/avatar';
import { Sparkline } from '@/components/ui/sparkline';
import { Skeleton } from '@/components/ui/skeleton';

interface SystemHealthLite {
  database?: {
    counts?: { accounts?: number; chatSessions?: number; chatMessages?: number };
    activity?: { sessionsLastHour?: number; messagesLastHour?: number };
  };
  redis?: { available?: boolean; latencyMs?: number };
  cache?: { hitRate?: number } | null;
  growth?: {
    sessionsPerDay?: Record<string, number>;
    totalSessionsLast7d?: number;
    previousWeekSessions?: number;
    growthPercent?: number | null;
    topAccounts?: { username: string; sessions: number }[];
  };
  alerts?: { level: 'info' | 'warning' | 'critical'; message: string }[];
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdSubdomain = searchParams.get('created');

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);

  const [health, setHealth] = useState<SystemHealthLite | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [websitesCount, setWebsitesCount] = useState<number | null>(null);
  const [websitesPages, setWebsitesPages] = useState<number>(0);

  const [checklistProgress, setChecklistProgress] = useState<Record<string, { total: number; completed: number }>>({});

  const [showCreatedNotification, setShowCreatedNotification] = useState(false);

  useEffect(() => {
    if (createdSubdomain) {
      setShowCreatedNotification(true);
      const t = setTimeout(() => setShowCreatedNotification(false), 5000);
      return () => clearTimeout(t);
    }
  }, [createdSubdomain]);

  useEffect(() => {
    (async () => {
      try {
        const authRes = await fetch('/api/admin');
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push('/admin');
          return;
        }
        const [accountsRes, checklistRes, websitesRes, healthRes] = await Promise.allSettled([
          fetch('/api/admin/accounts'),
          fetch('/api/admin/checklist/summary'),
          fetch('/api/admin/websites'),
          fetch('/api/admin/system-health'),
        ]);

        if (accountsRes.status === 'fulfilled' && accountsRes.value.ok) {
          const data = await accountsRes.value.json();
          setInfluencers(data.influencers || []);
        }
        if (checklistRes.status === 'fulfilled' && checklistRes.value.ok) {
          const data = await checklistRes.value.json();
          setChecklistProgress(data.progress || {});
        }
        if (websitesRes.status === 'fulfilled' && websitesRes.value.ok) {
          const data = await websitesRes.value.json();
          setWebsitesCount((data.websites || []).length);
          setWebsitesPages(
            (data.websites || []).reduce(
              (s: number, w: { pagesCount?: number }) => s + (w.pagesCount || 0),
              0,
            ),
          );
        }
        if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
          const data = await healthRes.value.json();
          setHealth(data as SystemHealthLite);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setHealthLoading(false);
      }
    })();
  }, [router]);

  // Derived
  const accountCount = influencers.length;
  const activeCount = influencers.filter((i) => i.is_active).length;
  const totalFollowers = influencers.reduce((s, i) => s + (i.followers_count || 0), 0);

  const growthSeries = (() => {
    const spd = health?.growth?.sessionsPerDay;
    if (!spd) return [] as number[];
    return Object.keys(spd)
      .sort()
      .slice(-14)
      .map((k) => spd[k] || 0);
  })();

  const growthPct = health?.growth?.growthPercent ?? null;
  const totalChats = health?.database?.counts?.chatSessions ?? 0;
  const sessionsLastHour = health?.database?.activity?.sessionsLastHour ?? 0;

  const recentAccounts = [...influencers]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 6);

  return (
    <>
      {/* Success flash */}
      {showCreatedNotification && (
        <div
          className="fixed top-20 start-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[10px] bg-[color:var(--ink-900)] text-white text-[13px] shadow-xl flex items-center gap-2 animate-[fadein_.3s_ease]"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4" />
          הצ׳אטבוט נוצר בהצלחה · <span className="opacity-70">/chat/{createdSubdomain}</span>
        </div>
      )}

      <PageHeader
        eyebrow="סקירה כללית"
        title={
          <span className="inline-flex items-center gap-2.5">
            שלום, Admin
            <span className="w-2 h-2 rounded-full bg-[color:var(--success)] animate-pulse" aria-hidden />
          </span>
        }
        description="מבט-על על החשבונות, האתרים והפעילות של המערכת — הכל במסך אחד."
        actions={
          <>
            <ButtonLink href="/admin/accounts" variant="outline" size="sm">
              <Users className="w-3.5 h-3.5" />
              כל החשבונות
            </ButtonLink>
            <ButtonLink href="/admin/add" variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              חשבון חדש
            </ButtonLink>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="חשבונות"
          icon={Users}
          value={loading ? '—' : formatNumber(accountCount)}
          description={`${activeCount} פעילים`}
          sheen
        />
        <KpiCard
          label="אתרים"
          icon={Globe}
          value={websitesCount == null ? '—' : formatNumber(websitesCount)}
          description={`${formatNumber(websitesPages)} מסמכים`}
        />
        <KpiCard
          label="סה״כ עוקבים"
          icon={Sparkles}
          value={loading ? '—' : formatCompact(totalFollowers)}
          description="בכל חשבונות סושיאל"
        />
        <KpiCard
          label="שיחות"
          icon={MessagesSquare}
          value={healthLoading ? '—' : formatNumber(totalChats)}
          delta={growthPct == null ? null : growthPct}
          deltaLabel="לעומת שבוע קודם"
          spark={growthSeries.length > 1 ? growthSeries : undefined}
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left: recent accounts */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>חשבונות אחרונים</CardTitle>
                <CardDescription>שישה החשבונות שנוספו לאחרונה</CardDescription>
              </div>
              <Link
                href="/admin/accounts"
                className="text-[12.5px] text-[color:var(--ink-600)] hover:text-[color:var(--ink-900)] inline-flex items-center gap-1"
              >
                הצג הכל
                <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="flex flex-col gap-3 py-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-9 h-9 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-3.5 w-32 mb-1.5" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                      <Skeleton className="h-2 w-20" />
                    </div>
                  ))}
                </div>
              ) : recentAccounts.length === 0 ? (
                <EmptyAccounts />
              ) : (
                <div className="-mx-5">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th className="ps-5">חשבון</th>
                        <th>עוקבים</th>
                        <th>סוג</th>
                        <th>צ׳קליסט</th>
                        <th className="pe-5 text-end">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAccounts.map((i) => {
                        const cp = checklistProgress[i.id];
                        const pct = cp ? Math.round((cp.completed / cp.total) * 100) : null;
                        return (
                          <tr key={i.id}>
                            <td className="ps-5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar
                                  src={i.profile_pic_url ? getProxiedImageUrl(i.profile_pic_url) : null}
                                  alt={i.display_name}
                                  fallback={i.display_name}
                                  size={32}
                                  rounded
                                />
                                <div className="min-w-0">
                                  <div className="text-[13px] font-semibold text-[color:var(--ink-900)] truncate">
                                    {i.display_name}
                                  </div>
                                  <div className="text-[11.5px] text-[color:var(--ink-500)] truncate">
                                    @{i.username}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="tabular-nums text-[color:var(--ink-700)]">
                              {formatCompact(i.followers_count || 0)}
                            </td>
                            <td>
                              {i.type === 'brand' ? (
                                <Badge variant="accent">מותג</Badge>
                              ) : (
                                <Badge variant="outline">משפיען</Badge>
                              )}
                              {i.is_active ? (
                                <Badge variant="success" className="ms-1.5" dot>
                                  פעיל
                                </Badge>
                              ) : (
                                <Badge variant="neutral" className="ms-1.5">לא פעיל</Badge>
                              )}
                            </td>
                            <td>
                              {pct == null ? (
                                <span className="text-[11.5px] text-[color:var(--ink-400)]">—</span>
                              ) : (
                                <div className="flex items-center gap-2 min-w-[120px]">
                                  <div className="ui-progress flex-1">
                                    <span style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[11px] font-semibold tabular-nums text-[color:var(--ink-600)] w-9 text-end">
                                    {pct}%
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="pe-5">
                              <div className="flex items-center gap-1 justify-end">
                                <Link
                                  href={`/admin/influencers/${i.id}`}
                                  className="ui-btn ui-btn-icon-sm ui-btn-ghost focus-ring"
                                  aria-label="ניהול"
                                  title="ניהול"
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                </Link>
                                <a
                                  href={`/chat/${i.username}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ui-btn ui-btn-icon-sm ui-btn-ghost focus-ring"
                                  aria-label="פתח צ׳אט"
                                  title="פתח צ׳אט"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity chart */}
          <Card>
            <CardHeader className="flex-row items-end justify-between">
              <div>
                <CardTitle>שיחות ב-14 ימים אחרונים</CardTitle>
                <CardDescription>
                  סה״כ {formatNumber(health?.growth?.totalSessionsLast7d || 0)} בשבוע האחרון
                  {growthPct != null && (
                    <>
                      {' · '}
                      <span
                        className={
                          growthPct >= 0
                            ? 'text-[color:var(--success)] font-medium'
                            : 'text-[color:var(--danger)] font-medium'
                        }
                      >
                        {growthPct >= 0 ? '+' : ''}
                        {growthPct.toFixed(1)}%
                      </span>
                    </>
                  )}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {healthLoading ? (
                <Skeleton className="w-full h-32" />
              ) : growthSeries.length > 1 ? (
                <div className="w-full">
                  <div className="ui-grid-bg rounded-[8px] p-3">
                    <Sparkline
                      values={growthSeries}
                      width={800}
                      height={120}
                      className="w-full h-32"
                      strokeWidth={2}
                    />
                  </div>
                  <div className="grid grid-cols-7 mt-2 text-[10.5px] text-[color:var(--ink-400)]">
                    {['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳'].map((d, i) => (
                      <span key={i} className="text-center">{d}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-[12.5px] text-[color:var(--ink-500)]">
                  אין מספיק נתונים להצגת גרף.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* System pulse */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>מצב מערכת</CardTitle>
                <Link
                  href="/admin/monitoring"
                  className="text-[12px] text-[color:var(--ink-600)] hover:text-[color:var(--ink-900)] inline-flex items-center gap-1"
                >
                  מוניטורינג מלא
                  <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex flex-col gap-3">
              <StatusRow
                label="Database"
                ok={!!health}
                meta={`${formatNumber(health?.database?.counts?.accounts || 0)} חשבונות`}
              />
              <StatusRow
                label="Redis"
                ok={!!health?.redis?.available}
                meta={`${health?.redis?.latencyMs ?? 0} ms`}
              />
              <StatusRow
                label="Cache hit rate"
                ok={(health?.cache?.hitRate ?? 0) > 0.5}
                meta={`${Math.round((health?.cache?.hitRate ?? 0) * 100)}%`}
              />
              <StatusRow
                label="שיחות בשעה"
                ok={sessionsLastHour >= 0}
                meta={formatNumber(sessionsLastHour)}
                hideDot
              />

              {health?.alerts && health.alerts.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <div className="flex flex-col gap-2">
                    {health.alerts.slice(0, 3).map((a, i) => {
                      const color =
                        a.level === 'critical'
                          ? 'var(--danger)'
                          : a.level === 'warning'
                            ? 'var(--warning)'
                            : 'var(--accent)';
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2.5 rounded-md bg-[color:var(--surface-2)] text-[12px]"
                          style={{ borderInlineStart: `2px solid ${color}` }}
                        >
                          <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color }} />
                          <span className="text-[color:var(--ink-800)] leading-relaxed">{a.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>קיצורי דרך</CardTitle>
              <CardDescription>הפעולות הנפוצות ביותר</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 grid grid-cols-2 gap-2">
              <QuickAction href="/admin/add" icon={UserPlus} label="קליטת חשבון" />
              <QuickAction href="/admin/onboarding" icon={ListChecks} label="אונבורדינג" />
              <QuickAction href="/admin/websites" icon={Globe} label="ניהול אתרים" />
              <QuickAction href="/admin/monitoring" icon={Activity} label="מוניטורינג" />
            </CardContent>
          </Card>

          {/* Top accounts by sessions */}
          {health?.growth?.topAccounts && health.growth.topAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>הכי פעילים השבוע</CardTitle>
                <CardDescription>מספר שיחות ב-7 ימים</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-2.5">
                {health.growth.topAccounts.slice(0, 5).map((a, i) => {
                  const max = Math.max(...health.growth!.topAccounts!.map((x) => x.sessions)) || 1;
                  const pct = (a.sessions / max) * 100;
                  return (
                    <div key={a.username} className="flex items-center gap-3">
                      <span className="text-[11px] tabular-nums text-[color:var(--ink-400)] w-4 text-center">
                        {i + 1}
                      </span>
                      <span className="text-[13px] text-[color:var(--ink-800)] min-w-0 flex-1 truncate">
                        @{a.username}
                      </span>
                      <div className="w-24 h-1.5 rounded-full bg-[color:var(--ink-100)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg, var(--brand), var(--accent))',
                          }}
                        />
                      </div>
                      <span className="text-[12px] tabular-nums font-semibold text-[color:var(--ink-700)] w-10 text-end">
                        {formatNumber(a.sessions)}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function StatusRow({
  label,
  ok,
  meta,
  hideDot,
}: {
  label: string;
  ok: boolean;
  meta?: React.ReactNode;
  hideDot?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {!hideDot && (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: ok ? 'var(--success)' : 'var(--danger)',
              boxShadow: `0 0 0 3px ${ok ? 'rgba(23,163,74,0.18)' : 'rgba(220,38,39,0.18)'}`,
            }}
          />
        )}
        <span className="text-[12.5px] text-[color:var(--ink-700)]">{label}</span>
      </div>
      <span className="text-[12px] tabular-nums font-medium text-[color:var(--ink-600)]">{meta}</span>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col items-start gap-2 p-3 rounded-[10px] bg-[color:var(--surface-1)] hover:bg-[color:var(--surface-0)] border border-[color:var(--line)] hover:border-[color:var(--ink-300)] transition-all"
    >
      <span className="w-7 h-7 rounded-md bg-[color:var(--surface-0)] ring-1 ring-[color:var(--line)] flex items-center justify-center text-[color:var(--ink-700)] group-hover:text-[color:var(--brand)] transition-colors">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
      </span>
      <div className="flex items-center justify-between w-full">
        <span className="text-[12.5px] font-medium text-[color:var(--ink-800)] group-hover:text-[color:var(--ink-900)]">
          {label}
        </span>
        <ArrowUpRight className="w-3 h-3 text-[color:var(--ink-400)] group-hover:text-[color:var(--brand)] transition-colors rtl:-scale-x-100" />
      </div>
    </Link>
  );
}

function EmptyAccounts() {
  return (
    <div className="py-12 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[color:var(--ink-100)] flex items-center justify-center">
        <Users className="w-4 h-4 text-[color:var(--ink-500)]" />
      </div>
      <p className="text-[13px] font-semibold text-[color:var(--ink-800)] mb-1">אין עדיין חשבונות</p>
      <p className="text-[12px] text-[color:var(--ink-500)] mb-4">התחילו על ידי הוספת חשבון ראשון</p>
      <ButtonLink href="/admin/add" variant="primary" size="sm">
        <Plus className="w-3.5 h-3.5" />
        הוספת חשבון
      </ButtonLink>
    </div>
  );
}

// ───── Helpers ─────
function formatCompact(n: number) {
  try {
    return new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return formatNumber(n);
  }
}

export default function AdminOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-[color:var(--brand)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
