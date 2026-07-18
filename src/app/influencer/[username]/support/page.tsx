'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  User,
  Phone,
  Package,
  RefreshCw,
  Send,
  Truck,
  HelpCircle,
  PauseCircle,
  Search,
  Copy,
  History,
  ChevronLeft,
  X,
  Download,
  Calendar,
  LogOut,
  BarChart3,
  UserCheck,
  Image as ImageIcon,
  MessageCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { fetchInfluencerByUsername } from '@/lib/influencer/client';
import type { Influencer } from '@/types';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings } from '@/lib/i18n/dashboard';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TicketStatus =
  | 'new'
  | 'in_progress'
  | 'awaiting_customer'
  | 'shipped'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface Ticket {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  message: string;
  brand: string | null;
  order_number: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  ref_source: string | null;
  internal_notes: string | null;
  assigned_to: string | null;
  assigned_agent_id: string | null;
  last_customer_notified_at: string | null;
  tracking_number: string | null;
  resolution_summary: string | null;
  resolved_at: string | null;
  delivered_at?: string | null;
  last_shipment_status?: string | null;
  feedback_status?: 'pending' | 'positive' | 'issue' | 'expired' | null;
  feedback_sent_at?: string | null;
  feedback_responded_at?: string | null;
  products?: { name: string; coupon_code: string | null; brand: string | null } | null;
}

interface RoutingAlternative {
  ticket_id: string;
  account_id: string;
  brand: string | null;
  customer_name: string | null;
  last_outbound_at: string;
}

interface RoutingMeta {
  matched_by: 'context' | 'recent_outbound' | 'phone';
  ambiguous: boolean;
  alternatives: RoutingAlternative[];
}

interface HistoryEntry {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  body_text?: string | null; // exact rendered WhatsApp body for customer_notified
  whatsapp_template_name: string | null;
  whatsapp_message_id: string | null;
  actor: string | null;
  created_at: string;
  attachment_url?: string | null;
  attachment_filename?: string | null;
  routing_meta?: RoutingMeta | null;
}

/* ------------------------------------------------------------------ */
/*  Status config                                                      */
/* ------------------------------------------------------------------ */

const STATUS_LABEL_HE: Record<TicketStatus, string> = {
  new: 'חדש',
  in_progress: 'בטיפול',
  awaiting_customer: 'ממתין ללקוחה',
  shipped: 'יצא למשלוח',
  resolved: 'טופל',
  closed: 'סגור',
  cancelled: 'בוטל',
};

const STATUS_LABEL_EN: Record<TicketStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  awaiting_customer: 'Awaiting customer',
  shipped: 'Shipped',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

function statusLabel(s: TicketStatus, lang: 'he' | 'en'): string {
  return (lang === 'en' ? STATUS_LABEL_EN : STATUS_LABEL_HE)[s];
}

const STATUS_COLOR: Record<TicketStatus, { dot: string; text: string; bg: string }> = {
  new:               { dot: '#3b82f6', text: '#1d4ed8', bg: '#dbeafe' },
  in_progress:       { dot: '#f59e0b', text: '#92400e', bg: '#fef3c7' },
  awaiting_customer: { dot: '#a855f7', text: '#6b21a8', bg: '#f3e8ff' },
  shipped:           { dot: '#06b6d4', text: '#0e7490', bg: '#cffafe' },
  resolved:          { dot: '#22c55e', text: '#166534', bg: '#dcfce7' },
  closed:            { dot: '#6b7280', text: '#374151', bg: '#f3f4f6' },
  cancelled:         { dot: '#ef4444', text: '#991b1b', bg: '#fee2e2' },
};

const STATUS_ICON: Record<TicketStatus, React.ComponentType<{ className?: string }>> = {
  new: MessageSquare,
  in_progress: Clock,
  awaiting_customer: HelpCircle,
  shipped: Truck,
  resolved: CheckCircle,
  closed: XCircle,
  cancelled: PauseCircle,
};

/** What the brand can do per current status — guides the next-step UI. */
const TEMPLATE_KEY_BY_STATUS: Record<TicketStatus, string | null> = {
  new: 'in_progress',
  in_progress: 'awaiting_customer',
  awaiting_customer: null, // free choice
  shipped: 'resolved',
  resolved: null,
  closed: null,
  cancelled: null,
};

function shortCode(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function formatRelative(iso: string, lang: 'he' | 'en' = 'he'): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  const isEn = lang === 'en';
  if (m < 1) return isEn ? 'just now' : 'עכשיו';
  if (m < 60) return isEn ? `${m}m ago` : `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return isEn ? `${h}h ago` : `לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  if (d < 7) return isEn ? `${d}d ago` : `לפני ${d} ימים`;
  return new Date(iso).toLocaleDateString(isEn ? 'en-US' : 'he-IL');
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SupportPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const router = useRouter();
  // Account language for i18n. Pulled from /api/influencer/nav-features,
  // cached in localStorage so subsequent renders are synchronous.
  const { lang } = useDashboardLang(username);
  const t = getDashboardStrings(lang).support;

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [agent, setAgent] = useState<{
    id: string;
    display_name: string;
    is_admin: boolean;
    account_id: string;
  } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | TicketStatus>('new');
  // Owner filter — agents typically want to see "their" tickets first.
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  // Feedback filter — surface "issue reported" tickets quickly.
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'issue' | 'positive' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [total, setTotal] = useState<number>(0);
  // Date range — narrows the list. Empty = no bound on that side.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Boot: auth + load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Accounts that enforce per-agent login: the agent session is the *only*
        // accepted auth — the legacy influencer cookie can't bypass attribution.
        // Each has a dedicated branded login page.
        const brandedLogin: Record<string, string> = {
          'labeaute.israel': '/labeaute/login',
          argania_group: '/argania/login',
          studiopasha_fashion: '/studiopasha/login',
        };
        const enforceAgentLogin = username === 'labeaute.israel' || username === 'argania_group';

        const agentRes = await fetch(`/api/agent/me?accountUsername=${username}`, { cache: 'no-store' });
        const agentData = await agentRes.json();
        const agentAuthed = !!agentData.authenticated;

        if (agentAuthed) {
          if (!cancelled) {
            setAgent({
              id: agentData.agent.id,
              display_name: agentData.agent.display_name,
              is_admin: agentData.agent.is_admin,
              account_id: agentData.agent.account_id,
            });
            // Default landing view for an agent: their own tickets.
            // Admins see the full queue (they need the bird's-eye view).
            if (!agentData.agent.is_admin) {
              setOwnerFilter('mine');
              // status filter 'all' so the agent sees everything they own,
              // not just `new` (which would hide in_progress / awaiting work).
              setFilter('all');
            }
          }
        } else if (enforceAgentLogin) {
          router.push(brandedLogin[username] || '/labeaute/login');
          return;
        } else {
          // Other accounts: allow legacy influencer cookie.
          const authRes = await fetch(`/api/influencer/auth?username=${username}`);
          const authData = await authRes.json();
          if (!authData.authenticated) {
            router.push(brandedLogin[username] || `/influencer/${username}`);
            return;
          }
        }

        const inf = await fetchInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }
        if (!cancelled) {
          setInfluencer(inf);
          await fetchList(filter, '');
          setLoading(false);
        }
      } catch (e) {
        console.error('boot error:', e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const handleAgentLogout = useCallback(async () => {
    try {
      await fetch('/api/agent/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountUsername: username }),
      });
    } catch {}
    if (username === 'labeaute.israel') {
      router.push('/labeaute/login');
    } else {
      router.push(`/influencer/${username}`);
    }
  }, [username, router]);

  // Refetch on filter change
  useEffect(() => {
    if (!influencer) return;
    setPage(1);
    fetchList(filter, search, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, ownerFilter, feedbackFilter]);

  // Refetch on page change
  useEffect(() => {
    if (!influencer) return;
    fetchList(filter, search, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Refetch on date-range change — debounced briefly so a quick edit
  // doesn't fire two requests.
  useEffect(() => {
    if (!influencer) return;
    const t = setTimeout(() => {
      setPage(1);
      fetchList(filter, search, 1);
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const fetchList = useCallback(async (
    statusFilter: typeof filter,
    q: string,
    p: number = 1,
  ) => {
    const url = new URL(`/api/influencer/${username}/support-tickets`, window.location.origin);
    if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
    const cleanedQ = q.trim().replace(/^#+/, '').trim();
    if (cleanedQ) url.searchParams.set('q', cleanedQ);
    if (p > 1) url.searchParams.set('page', String(p));
    if (dateFrom) url.searchParams.set('from', new Date(dateFrom + 'T00:00:00').toISOString());
    if (dateTo) url.searchParams.set('to', new Date(dateTo + 'T23:59:59').toISOString());
    if (ownerFilter === 'mine') url.searchParams.set('mine', '1');
    else if (ownerFilter === 'unassigned') url.searchParams.set('unassigned', '1');
    if (feedbackFilter !== 'all') url.searchParams.set('feedback', feedbackFilter);
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const data = await res.json();
    setTickets(data.tickets || []);
    setCounts(data.counts || {});
    setTotal(data.total || 0);
    setPageSize(data.pageSize || 50);
  }, [username, dateFrom, dateTo, ownerFilter, feedbackFilter]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const url = new URL(
        `/api/influencer/${username}/support-tickets/export`,
        window.location.origin,
      );
      if (filter !== 'all') url.searchParams.set('status', filter);
      const cleanedQ = search.trim().replace(/^#+/, '').trim();
      if (cleanedQ) url.searchParams.set('q', cleanedQ);
      if (dateFrom) url.searchParams.set('from', new Date(dateFrom + 'T00:00:00').toISOString());
      if (dateTo) url.searchParams.set('to', new Date(dateTo + 'T23:59:59').toISOString());
      const res = await fetch(url.toString());
      if (!res.ok) {
        alert(t.exportFailed);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const name = m?.[1] || 'support.xlsx';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } finally {
      setExporting(false);
    }
  }, [username, filter, search, dateFrom, dateTo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchList(filter, search);
    setRefreshing(false);
  };

  const handleSearch = async () => {
    await fetchList(filter, search);
  };

  // Debounced live search — fire ~300ms after the user stops typing.
  // Reset to page 1 on a new query (otherwise you'd be on page 4 of
  // a different result set with no rows).
  useEffect(() => {
    if (!influencer) return;
    const t = setTimeout(() => {
      setPage(1);
      fetchList(filter, search, 1);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl" style={{ color: 'var(--dash-text, #fff)' }}>
      <div className="max-w-7xl mx-auto p-4 animate-slide-up">
        {/* Agent header bar — only when an agent session is active */}
        {agent && (
          <div
            className="mb-3 px-3 py-2 rounded-xl flex items-center justify-between flex-wrap gap-2"
            style={{
              background: 'rgba(136,63,226,0.08)',
              border: '1px solid rgba(136,63,226,0.2)',
            }}
          >
            <div className="flex items-center gap-2 text-sm">
              <UserCheck className="w-4 h-4" style={{ color: '#883fe2' }} />
              <span style={{ color: 'var(--dash-text, #fff)' }}>
                {t.agentLoggedInAs}{' '}
                <span className="font-semibold">{agent.display_name}</span>
              </span>
              {agent.is_admin && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: '#883fe2', color: '#fff' }}
                >
                  {t.adminBadge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {agent.is_admin && (
                <button
                  onClick={() => router.push('/labeaute/admin/analytics')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
                  style={{ background: '#883fe2', color: '#fff' }}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  {t.analyticsBtn}
                </button>
              )}
              <button
                onClick={handleAgentLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--dash-text-2, #9ca3af)' }}
              >
                <LogOut className="w-3.5 h-3.5" />
                {t.logout}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{t.pageTitle}</h1>
            <p className="text-sm" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {lang === 'en'
                ? `${counts.new || 0} new · ${counts.in_progress || 0} in progress · ${counts.shipped || 0} shipped · total ${counts.all || 0}`
                : `${counts.new || 0} חדשות · ${counts.in_progress || 0} בטיפול · ${counts.shipped || 0} במשלוח · סה״כ ${counts.all || 0}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{
                background: showFilters ? '#883fe2' : 'rgba(255,255,255,0.06)',
                color: showFilters ? '#fff' : 'var(--dash-text-2, #9ca3af)',
              }}
              title={t.dateFilterTooltip}
            >
              <Calendar className="w-4 h-4" />
              {dateFrom || dateTo ? t.dateFilterActive : t.dateFilterLabel}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: '#883fe2', color: '#fff' }}
              title={t.exportTooltip}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {t.exportBtn}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg"
              style={{ color: 'var(--dash-text-2, #9ca3af)' }}
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Owner filter — only meaningful when an agent is logged in */}
        {agent && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {[
              { key: 'all' as const, label: t.ownerAll },
              { key: 'mine' as const, label: t.ownerMine },
              { key: 'unassigned' as const, label: t.ownerUnassigned },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setOwnerFilter(opt.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: ownerFilter === opt.key ? '#883fe2' : 'rgba(255,255,255,0.06)',
                  color: ownerFilter === opt.key ? '#fff' : 'var(--dash-text-2, #9ca3af)',
                }}
              >
                {opt.label}
              </button>
            ))}
            <span className="opacity-30 mx-1">|</span>
            {[
              { key: 'all' as const, label: t.feedbackFilterAll, bg: 'rgba(255,255,255,0.06)', fg: 'var(--dash-text-2, #9ca3af)' },
              { key: 'issue' as const, label: t.feedbackFilterIssue, bg: '#fbbf24', fg: '#1f2937' },
              { key: 'positive' as const, label: t.feedbackFilterPositive, bg: '#22c55e', fg: '#fff' },
              { key: 'pending' as const, label: t.feedbackFilterPending, bg: '#06b6d4', fg: '#fff' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFeedbackFilter(opt.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: feedbackFilter === opt.key ? opt.bg : 'rgba(255,255,255,0.06)',
                  color: feedbackFilter === opt.key ? opt.fg : 'var(--dash-text-2, #9ca3af)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Date filter row — visible when toggled, takes effect immediately */}
        {showFilters && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-3 flex-wrap"
            style={{ background: 'rgba(136,63,226,0.08)', border: '1px solid rgba(136,63,226,0.2)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{t.dateFromLabel}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm p-1.5 rounded-lg outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text, #fff)', minWidth: 140 }}
                dir="ltr"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{t.dateToLabel}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-sm p-1.5 rounded-lg outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text, #fff)', minWidth: 140 }}
                dir="ltr"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-2, #9ca3af)' }}
              >
                {t.clearDates}
              </button>
            )}
            <span className="text-[11px] mr-auto" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              {t.dateFilterExportNote}
            </span>
          </div>
        )}

        {/* Live search — debounced to ~300ms; matches name / phone /
            order# / message text. No "submit" button — typing is enough. */}
        <div className="mb-4">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--dash-text-3, #6b7280)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="flex-1 bg-transparent outline-none text-sm"
              dir={lang === 'en' ? 'ltr' : 'rtl'}
              style={{ color: 'var(--dash-text, #fff)' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="p-0.5 rounded opacity-50 hover:opacity-100"
                style={{ color: 'var(--dash-text-2, #9ca3af)' }}
                title={t.clearSearch}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {([
            { key: 'all', label: t.filterAll },
            { key: 'new', label: statusLabel('new', lang) },
            { key: 'in_progress', label: statusLabel('in_progress', lang) },
            { key: 'awaiting_customer', label: statusLabel('awaiting_customer', lang) },
            { key: 'shipped', label: statusLabel('shipped', lang) },
            { key: 'resolved', label: statusLabel('resolved', lang) },
            { key: 'closed', label: statusLabel('closed', lang) },
            { key: 'cancelled', label: statusLabel('cancelled', lang) },
          ] as const).map((tab) => {
            const active = filter === tab.key;
            const c = tab.key !== 'all' ? counts[tab.key as string] || 0 : counts.all || 0;
            return (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key); setSelectedId(null); }}
                className="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-colors"
                style={{
                  background: active ? '#883fe2' : 'rgba(255,255,255,0.05)',
                  color: active ? '#fff' : 'var(--dash-text-2, #9ca3af)',
                }}
              >
                {tab.label}
                <span
                  className="px-2 py-0.5 rounded-full text-xs"
                  style={{
                    background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  {c}
                </span>
              </button>
            );
          })}
        </div>

        {/* List + detail */}
        {tickets.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dash-text-3, #6b7280)' }} />
            <h2 className="text-xl font-semibold mb-2">{t.emptyForStatus}</h2>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
            <div>
              <TicketList
                tickets={tickets}
                selectedId={selectedId}
                onSelect={setSelectedId}
                lang={lang}
              />
              {/* Pagination — server returns 50 per page; without this
                  control the brand could only ever see the first page. */}
              {total > pageSize && (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  lang={lang}
                  onChange={(p) => {
                    setPage(p);
                    setSelectedId(null);
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                />
              )}
            </div>
            <div className="lg:sticky lg:top-4 self-start">
              {selectedId ? (
                <TicketDetail
                  username={username}
                  ticketId={selectedId}
                  influencer={influencer}
                  agent={agent}
                  onChange={() => fetchList(filter, search, page)}
                  onClose={() => setSelectedId(null)}
                  lang={lang}
                />
              ) : (
                <div className="hidden lg:flex items-center justify-center p-12 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ color: 'var(--dash-text-3, #6b7280)' }}>{t.selectTicketHint}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ticket list                                                        */
/* ------------------------------------------------------------------ */

function TicketList({
  tickets,
  selectedId,
  onSelect,
  lang,
}: {
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: 'he' | 'en';
}) {
  return (
    <div className="space-y-2">
      {tickets.map((t) => {
        const c = STATUS_COLOR[t.status];
        const Icon = STATUS_ICON[t.status];
        const isSelected = selectedId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="w-full text-right p-4 rounded-xl transition-all"
            style={{
              background: isSelected ? 'rgba(136,63,226,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isSelected ? '#883fe2' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--dash-text-2, #9ca3af)' }} />
                <span className="font-medium truncate">{t.customer_name}</span>
              </div>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0"
                style={{ background: c.bg, color: c.text }}
              >
                <Icon className="w-3 h-3" />
                {statusLabel(t.status, lang)}
              </span>
            </div>
            <p className="text-sm line-clamp-2 mb-2" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {t.message}
            </p>
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              <span>{formatRelative(t.created_at, lang)}</span>
              {t.order_number && <span>#{t.order_number.replace(/^#+/, '')}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail                                                             */
/* ------------------------------------------------------------------ */

function TicketDetail({
  username,
  ticketId,
  influencer,
  agent,
  onChange,
  onClose,
  lang,
}: {
  username: string;
  ticketId: string;
  influencer: Influencer | null;
  agent: { id: string; display_name: string; is_admin: boolean; account_id: string } | null;
  onChange: () => void;
  onClose: () => void;
  lang: 'he' | 'en';
}) {
  const t = getDashboardStrings(lang).support;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<TicketStatus | null>(null);
  const [internalNotes, setInternalNotes] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState<null | 'in_progress' | 'awaiting_customer' | 'shipped' | 'resolved'>(null);
  const [sending, setSending] = useState(false);

  // 24-hour service window for free-form messages
  const [serviceWindow, setServiceWindow] = useState<{
    withinWindow: boolean;
    expiresAt: string | null;
    lastInboundAt: string | null;
  } | null>(null);
  const [directBody, setDirectBody] = useState('');
  const [directImage, setDirectImage] = useState<File | null>(null);
  const [directImageCaption, setDirectImageCaption] = useState('');
  const [sendingDirect, setSendingDirect] = useState(false);

  // Polling fetch that doesn't toggle the loading spinner. Used by the
  // 15s background poll so the agent sees fresh replies + window
  // changes without manual refresh. The first call still uses the
  // spinning version so the panel feels responsive on open.
  const fetchTicket = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`);
    if (!res.ok) {
      if (!silent) setLoading(false);
      return;
    }
    const data = await res.json();
    setTicket(data.ticket);
    setHistory(data.history || []);
    // Don't trample local edits-in-progress on background polls — only
    // hydrate the editable fields on the foreground (initial) load.
    if (!silent) {
      setInternalNotes(data.ticket?.internal_notes || '');
      setTrackingNumber(data.ticket?.tracking_number || '');
      setResolutionSummary(data.ticket?.resolution_summary || '');
      setLoading(false);
    }
    // Fire-and-forget: fetch the 24h service window status. Doesn't block render.
    fetch(`/api/influencer/${username}/support-tickets/${ticketId}/window`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => { if (w) setServiceWindow(w); })
      .catch(() => {});
  }, [username, ticketId]);

  // Background poll while the ticket is open: every 15s pull fresh
  // history + window status. Cheap (one ticket, one window, no images)
  // and means the agent sees a customer reply land even when Realtime
  // misses an event. Realtime push (below) is the fast path; polling
  // is the safety net.
  useEffect(() => {
    const id = setInterval(() => {
      fetchTicket(true).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [fetchTicket]);

  // There used to be a Realtime postgres_changes subscription here for ~50ms
  // refreshes. It required anon SELECT on support_ticket_history, which is what
  // left every account's ticket history world-readable. Realtime scopes reads
  // with RLS via auth.uid(), and influencers authenticate by cookie rather than
  // Supabase Auth, so there is no policy that admits them and only them — the
  // subscription cannot be secured as-is. The 15s poll above is the fallback the
  // original code already documented; it is now the only path.

  const handleSendDirectText = async () => {
    const txt = directBody.trim();
    if (!txt) return;
    setSendingDirect(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: txt }),
      });
      const data = await res.json();
      if (data.ok) {
        setDirectBody('');
        await fetchTicket();
        onChange();
      } else {
        alert(`${t.sendFailed} ${data.message || data.error || t.genericError}`);
      }
    } finally {
      setSendingDirect(false);
    }
  };

  // Outside the 24h window we can't send a free-form message; instead we
  // dispatch the support_freeform_message template, which wraps the
  // agent's text with a fixed greeting and invites the customer to reply
  // here in WhatsApp (re-opening the service window for further free
  // text). Capped at 900 chars by the template body limit.
  const handleSendFreeformTemplate = async () => {
    const txt = directBody.trim();
    if (!txt) return;
    if (txt.length > 900) {
      alert(`${t.messageTooLong} ${txt.length}.`);
      return;
    }
    setSendingDirect(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'freeform', content: txt }),
      });
      const data = await res.json();
      if (data.ok) {
        setDirectBody('');
        await fetchTicket();
        onChange();
      } else {
        alert(`${t.sendFailed} ${data.message || data.error || t.genericError}`);
      }
    } finally {
      setSendingDirect(false);
    }
  };

  const [deleting, setDeleting] = useState(false);
  const handleDeleteTicket = async () => {
    if (!agent?.is_admin) return;
    const confirmed = window.confirm(t.deleteConfirm);
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        onChange();
        onClose();
      } else {
        alert(`${t.deleteFailed} ${data.message || data.error || t.genericError}`);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSendDirectImage = async () => {
    if (!directImage) return;
    setSendingDirect(true);
    try {
      const fd = new FormData();
      fd.append('file', directImage);
      if (directImageCaption.trim()) fd.append('caption', directImageCaption.trim());
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}/send-image`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (data.ok) {
        setDirectImage(null);
        setDirectImageCaption('');
        await fetchTicket();
        onChange();
      } else {
        alert(`${t.sendFailed} ${data.message || data.error || t.genericError}`);
      }
    } finally {
      setSendingDirect(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const handleStatusChange = async (status: TicketStatus) => {
    setSavingStatus(status);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchTicket();
        onChange();
      }
    } finally {
      setSavingStatus(null);
    }
  };

  const handleSaveDetails = async () => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_notes: internalNotes,
          tracking_number: trackingNumber,
          resolution_summary: resolutionSummary,
        }),
      });
      if (res.ok) {
        await fetchTicket();
        onChange();
      }
    } finally {
      setSavingNote(false);
    }
  };

  const [assigning, setAssigning] = useState(false);
  const handleAssignToSelf = async () => {
    if (!agent) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignToSelf: true }),
      });
      if (res.ok) {
        await fetchTicket();
        onChange();
      }
    } finally {
      setAssigning(false);
    }
  };
  const handleUnassign = async () => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_agent_id: null }),
      });
      if (res.ok) {
        await fetchTicket();
        onChange();
      }
    } finally {
      setAssigning(false);
    }
  };

  // Focus shipment status — fetched live whenever a ticket opens. We
  // don't just store the ship_no, we keep the full status view (current
  // stage, last scan timestamp, destination branch) so the brand can
  // see exactly where the package is without leaving the CRM.
  //
  // Resolution state: 'idle' → 'loading' → ('found' | 'pending' | 'error')
  //   pending = Focus has no record (order hasn't shipped yet)
  //   error   = API/network failure (retry is fine)
  type FocusView = {
    found: boolean;
    shipmentNumber: string | null;
    statusText: string;
    isDelivered: boolean;
    isCanceled: boolean;
    isReturned: boolean;
    lastUpdate?: { date: string | null; time: string | null };
    destinationBranch?: string | null;
    shipmentDirection?: string | null;
    history?: Array<{ desc: string; date: string | null; time: string | null }>;
  };
  const [focusView, setFocusView] = useState<FocusView | null>(null);
  const [focusState, setFocusState] = useState<'idle' | 'loading' | 'found' | 'pending' | 'error'>('idle');

  const resolveFocus = useCallback(async (): Promise<FocusView | null> => {
    if (!ticket?.order_number) {
      setFocusState('idle');
      setFocusView(null);
      return null;
    }
    setFocusState('loading');
    try {
      const orderClean = ticket.order_number.replace(/[^0-9]/g, '');
      const res = await fetch(
        `/api/shipment/status?username=${encodeURIComponent(username)}&reference=${encodeURIComponent(orderClean)}`,
      );
      const data = (await res.json()) as FocusView | { error: string };
      if (!res.ok) {
        setFocusState('error');
        setFocusView(null);
        return null;
      }
      if (!('found' in data) || !data.found || !data.shipmentNumber) {
        setFocusState('pending');
        setFocusView(data as FocusView);
        return null;
      }
      setFocusView(data as FocusView);
      setFocusState('found');
      setTrackingNumber(data.shipmentNumber);
      // Persist tracking_number on the ticket if it's new — so other
      // surfaces (notification template, history) read the same value.
      if (data.shipmentNumber !== (ticket.tracking_number || '')) {
        await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracking_number: data.shipmentNumber }),
        });
      }
      return data as FocusView;
    } catch {
      setFocusState('error');
      setFocusView(null);
      return null;
    }
  }, [username, ticketId, ticket?.order_number, ticket?.tracking_number]);

  // Auto-fire on every ticket open. Resets state first so we don't
  // carry over a previous ticket's "found" view.
  useEffect(() => {
    setFocusView(null);
    setFocusState('idle');
    if (ticket?.order_number) {
      void resolveFocus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  const handleSendTemplate = async (
    template: 'in_progress' | 'awaiting_customer' | 'shipped' | 'resolved',
    extra: Record<string, string> = {},
  ) => {
    setSending(true);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchTicket();
        onChange();
        setShowSendDialog(null);
      } else {
        const msg = data.message || data.error || t.genericError;
        alert(`${t.sendFailed} ${msg}`);
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }
  if (!ticket) return null;

  const c = STATUS_COLOR[ticket.status];
  const Icon = STATUS_ICON[ticket.status];

  return (
    <div
      className="p-5 rounded-2xl space-y-5 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: c.bg, color: c.text }}
            >
              <Icon className="w-3.5 h-3.5" />
              {statusLabel(ticket.status, lang)}
            </span>
            <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
              #{shortCode(ticket.id)}
            </code>
          </div>
          <h3 className="text-lg font-semibold">{ticket.customer_name}</h3>
          <p className="text-xs" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
            {t.receivedPrefix} {formatRelative(ticket.created_at, lang)}
          </p>
        </div>
        <button onClick={onClose} className="lg:hidden" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Feedback badge — visible after delivered template was sent */}
      {ticket.feedback_status && (
        <div
          className="px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2"
          style={{
            background:
              ticket.feedback_status === 'issue'
                ? 'rgba(251,191,36,0.12)'
                : ticket.feedback_status === 'positive'
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(6,182,212,0.10)',
            border:
              ticket.feedback_status === 'issue'
                ? '1px solid rgba(251,191,36,0.35)'
                : ticket.feedback_status === 'positive'
                ? '1px solid rgba(34,197,94,0.35)'
                : '1px solid rgba(6,182,212,0.30)',
          }}
        >
          <span style={{ color: 'var(--dash-text, #fff)' }}>
            {ticket.feedback_status === 'positive' && t.feedbackBadgePositive}
            {ticket.feedback_status === 'issue' && t.feedbackBadgeIssue}
            {ticket.feedback_status === 'pending' && t.feedbackBadgePending}
            {ticket.feedback_status === 'expired' && t.feedbackBadgeExpired}
          </span>
          <span className="opacity-70">
            {ticket.feedback_responded_at
              ? `${t.feedbackRespondedPrefix} ${formatRelative(ticket.feedback_responded_at, lang)}`
              : ticket.feedback_sent_at
              ? `${t.feedbackSentPrefix} ${formatRelative(ticket.feedback_sent_at, lang)}`
              : ''}
          </span>
        </div>
      )}

      {/* Assignee row */}
      {agent && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center gap-2" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
            <UserCheck className="w-3.5 h-3.5" />
            {ticket.assigned_to ? (
              <span>
                {t.assigneeLabel} <span className="font-semibold" style={{ color: 'var(--dash-text, #fff)' }}>{ticket.assigned_to}</span>
                {ticket.assigned_agent_id === agent.id && (
                  <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                    {t.assigneeThatsMe}
                  </span>
                )}
              </span>
            ) : (
              <span>{t.assigneeUnassigned}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {ticket.assigned_agent_id !== agent.id && (
              <button
                onClick={handleAssignToSelf}
                disabled={assigning}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 disabled:opacity-50"
                style={{ background: '#883fe2', color: '#fff' }}
                title={
                  ticket.assigned_agent_id
                    ? `${t.assignPull} (${t.assignPullCurrently} ${ticket.assigned_to || t.someoneElse})`
                    : t.assignToMe
                }
              >
                {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
                {ticket.assigned_agent_id ? t.assignPull : t.assignToMe}
              </button>
            )}
            {ticket.assigned_agent_id === agent.id && (
              <button
                onClick={handleUnassign}
                disabled={assigning}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--dash-text-2, #9ca3af)' }}
              >
                {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
                {t.assignRelease}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Focus shipment status — most important info, lives at the top.
          Auto-resolves when a ticket is opened: takes the order_number
          from the ticket, calls Focus, displays the actual ship_no plus
          live delivery state. */}
      <FocusShipmentCard
        orderNumber={ticket.order_number}
        view={focusView}
        state={focusState}
        lang={lang}
        onRefresh={() => void resolveFocus()}
      />

      {/* Customer block */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {ticket.customer_phone && (
          <a
            href={`https://wa.me/${ticket.customer_phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm"
            style={{ color: '#22c55e' }}
          >
            <Phone className="w-4 h-4" />
            <span dir="ltr">{ticket.customer_phone}</span>
            <span className="text-xs opacity-70">(WhatsApp)</span>
          </a>
        )}
        {ticket.order_number && (
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4" style={{ color: 'var(--dash-text-2, #9ca3af)' }} />
            <span>{t.orderLabel} <code>{ticket.order_number}</code></span>
            <button
              onClick={() => navigator.clipboard.writeText(ticket.order_number || '')}
              className="text-xs opacity-70 hover:opacity-100"
            >
              <Copy className="w-3 h-3 inline" />
            </button>
          </div>
        )}
        {ticket.brand && (
          <div className="text-sm" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
            {t.brandLabel} <span style={{ color: 'var(--dash-text, #fff)' }}>{ticket.brand}</span>
          </div>
        )}
        {ticket.ref_source && (
          <div className="text-xs" style={{ color: '#883fe2' }}>{t.arrivedVia} {ticket.ref_source}</div>
        )}
      </div>

      {/* Original message */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{t.originalMessage}</div>
        <pre className="whitespace-pre-wrap text-sm p-3 rounded-xl font-sans" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {ticket.message}
        </pre>
      </div>

      {/* Status actions */}
      <div className="space-y-2">
        <div className="text-xs" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{t.changeStatus}</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL_HE) as TicketStatus[]).map((s) => {
            const isCurrent = s === ticket.status;
            const SI = STATUS_ICON[s];
            return (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={savingStatus !== null || isCurrent}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                style={{
                  background: isCurrent ? STATUS_COLOR[s].bg : 'rgba(255,255,255,0.05)',
                  color: isCurrent ? STATUS_COLOR[s].text : 'var(--dash-text-2, #9ca3af)',
                  border: isCurrent ? `1px solid ${STATUS_COLOR[s].dot}` : '1px solid transparent',
                }}
              >
                <SI className="w-3.5 h-3.5" />
                {statusLabel(s, lang)}
                {savingStatus === s && <Loader2 className="w-3 h-3 animate-spin" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Customer notification (WhatsApp) — hidden entirely for English
          accounts since they don't have WhatsApp templates approved (and
          IMAI explicitly has features.whatsappEnabled=false). Email is the
          channel for B2B SaaS; the WhatsApp template flow is retail-only. */}
      {lang !== 'en' && <div className="rounded-xl p-3"
        style={{ background: 'rgba(136,63,226,0.1)', border: '1px solid rgba(136,63,226,0.25)' }}>
        <div className="text-xs mb-2 font-semibold" style={{ color: '#c084fc' }}>{t.waSectionTitle}</div>
        <div className="flex flex-wrap gap-2">
          <NotifyButton label={t.waNotifyInProgress} onClick={() => setShowSendDialog('in_progress')} disabled={!ticket.customer_phone} />
          <NotifyButton label={t.waNotifyAwaiting} onClick={() => setShowSendDialog('awaiting_customer')} disabled={!ticket.customer_phone} />
          <NotifyButton label={t.waNotifyShipped} onClick={() => setShowSendDialog('shipped')} disabled={!ticket.customer_phone} />
          <NotifyButton label={t.waNotifyResolved} onClick={() => setShowSendDialog('resolved')} disabled={!ticket.customer_phone} />
        </div>
        {!ticket.customer_phone && (
          <p className="text-[11px] mt-2 opacity-70">{t.waNoPhone}</p>
        )}
        {ticket.last_customer_notified_at && (
          <p className="text-[11px] mt-2 opacity-70">
            {t.waLastUpdatePrefix} {formatRelative(ticket.last_customer_notified_at, lang)}
          </p>
        )}
      </div>}

      {/* Direct message — free-form text + image, only inside the 24h window.
          Also gated on lang !== 'en' since the freeform-message flow uses the
          same Hebrew WhatsApp template path. */}
      {lang !== 'en' && ticket.customer_phone && (
        <div className="rounded-xl p-3"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#15803d' }}>
              <MessageCircle className="w-4 h-4" />
              {t.directTitle}
            </div>
            {serviceWindow ? (
              serviceWindow.withinWindow ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.2)', color: '#15803d' }}>
                  {t.windowOpen}{serviceWindow.expiresAt ? ` · ${t.windowCloses} ${formatRelative(serviceWindow.expiresAt, lang)}` : ''}
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(217,119,6,0.15)', color: '#b45309' }}>
                  <AlertTriangle className="w-3 h-3" />
                  {t.windowClosed}
                </span>
              )
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>{t.windowChecking}</span>
            )}
          </div>

          {serviceWindow && !serviceWindow.withinWindow && (
            <p className="text-[11px] mb-2" style={{ color: '#b45309' }}>
              {t.windowClosedNote}
              {serviceWindow.lastInboundAt && (
                <> {t.windowLastInboundPrefix} {formatRelative(serviceWindow.lastInboundAt, lang)}.</>
              )}
            </p>
          )}

          {/* Free-form text — auto-routes between send-text (window open)
              and the support_freeform_message template (window closed).
              The template caps content at 900 chars due to Meta's body
              limit; send-text allows up to 4000. */}
          <div className="space-y-2">
            <textarea
              value={directBody}
              onChange={(e) => {
                const cap = serviceWindow?.withinWindow ? 4000 : 900;
                setDirectBody(e.target.value.slice(0, cap));
              }}
              placeholder={
                serviceWindow?.withinWindow
                  ? t.directPlaceholderOpen
                  : t.directPlaceholderClosed
              }
              disabled={sendingDirect}
              rows={3}
              className="w-full text-sm p-2.5 rounded-xl outline-none resize-y disabled:opacity-50"
              style={{
                background: 'var(--dash-surface-solid, #fff)',
                color: 'var(--dash-text, #1a1a2e)',
                border: '1px solid var(--dash-border, rgba(0,0,0,0.1))',
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px]" style={{ color: 'var(--dash-text-3)' }}>
                {directBody.length} / {serviceWindow?.withinWindow ? 4000 : 900}
              </span>
              <button
                onClick={
                  serviceWindow?.withinWindow ? handleSendDirectText : handleSendFreeformTemplate
                }
                disabled={!directBody.trim() || sendingDirect}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: '#15803d', color: '#fff' }}
              >
                {sendingDirect && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Send className="w-3.5 h-3.5" />
                {serviceWindow?.withinWindow ? t.directSend : t.directSendAsTemplate}
              </button>
            </div>
          </div>

          {/* Image picker */}
          <div className="mt-3 pt-3 space-y-2"
            style={{ borderTop: '1px solid var(--dash-border, rgba(0,0,0,0.06))' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <label
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${(!serviceWindow?.withinWindow || sendingDirect) ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{
                  background: 'var(--dash-surface, rgba(0,0,0,0.04))',
                  color: 'var(--dash-text-2)',
                  border: '1px solid var(--dash-border, rgba(0,0,0,0.08))',
                }}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {directImage ? directImage.name : t.imagePick}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!serviceWindow?.withinWindow || sendingDirect}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 10 * 1024 * 1024) {
                        alert(t.imageTooLarge);
                        e.target.value = '';
                        return;
                      }
                      setDirectImage(f);
                    }
                  }}
                />
              </label>
              {directImage && (
                <button
                  onClick={() => setDirectImage(null)}
                  className="text-[11px]"
                  style={{ color: 'var(--dash-text-3)' }}
                >
                  {t.imageCancel}
                </button>
              )}
            </div>
            {directImage && (
              <input
                type="text"
                value={directImageCaption}
                onChange={(e) => setDirectImageCaption(e.target.value.slice(0, 1024))}
                placeholder={t.imageCaptionPlaceholder}
                disabled={sendingDirect}
                className="w-full text-sm p-2 rounded-lg outline-none"
                style={{
                  background: 'var(--dash-surface-solid, #fff)',
                  color: 'var(--dash-text, #1a1a2e)',
                  border: '1px solid var(--dash-border, rgba(0,0,0,0.1))',
                }}
              />
            )}
            {directImage && (
              <div className="flex justify-end">
                <button
                  onClick={handleSendDirectImage}
                  disabled={!serviceWindow?.withinWindow || sendingDirect}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: '#15803d', color: '#fff' }}
                >
                  {sendingDirect && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Send className="w-3.5 h-3.5" />
                  {t.imageSend}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editable details */}
      <div className="space-y-3">
        <div>
          <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{t.internalNotesLabel}</div>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder={t.internalNotesPlaceholder}
            className="w-full text-sm p-3 rounded-xl outline-none resize-y min-h-[80px]"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--dash-text, #fff)' }}
          />
        </div>
        {/* Manual override for tracking_number — kept hidden by default
            since the FocusShipmentCard at the top fills + persists this
            automatically. Surfaced in a collapsible only when the
            resolver came back 'pending' (no Focus record yet) and the
            brand wants to type the number from somewhere else. */}
        {focusState !== 'found' && (
          <div>
            <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {t.focusTrackingLabel}
            </div>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="3409393"
              className="w-full text-sm p-2.5 rounded-xl outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--dash-text, #fff)' }}
              dir="ltr"
            />
          </div>
        )}
        {(ticket.status === 'resolved' || ticket.status === 'closed') && (
          <div>
            <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{t.resolutionSummaryLabel}</div>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder={t.resolutionSummaryPlaceholder}
              className="w-full text-sm p-3 rounded-xl outline-none resize-y min-h-[60px]"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--dash-text, #fff)' }}
            />
          </div>
        )}
        <button
          onClick={handleSaveDetails}
          disabled={savingNote}
          className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          style={{ background: '#883fe2', color: '#fff' }}
        >
          {savingNote && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.saveDetails}
        </button>
      </div>

      {/* History — chronological feed including customer replies */}
      {history.length > 0 && (
        <div>
          <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
            <History className="w-3.5 h-3.5" />
            {t.historyTitle}
          </div>
          <ol className="space-y-3 text-xs">
            {history.map((h) => {
              const isCustomerReply = h.action === 'customer_reply';
              const isBrandMessage = h.action === 'customer_notified';
              const isAgentDirect = h.action === 'agent_message' || h.action === 'agent_image';
              const isShipment = h.action === 'shipment_event';
              const isFeedback = h.action === 'customer_feedback';
              const dotColor = isCustomerReply
                ? '#22c55e'
                : isBrandMessage
                ? '#06b6d4'
                : isAgentDirect
                ? '#10b981'
                : isShipment
                ? '#a78bfa'
                : isFeedback
                ? (h.note === 'issue' ? '#fbbf24' : '#22c55e')
                : '#883fe2';
              return (
                <li key={h.id} className="flex gap-2 items-start">
                  <span
                    className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                    style={{ background: dotColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{historyLine(h, lang)}</span>
                      {isCustomerReply && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                          {t.historyNewReply}
                        </span>
                      )}
                      {isBrandMessage && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
                          {t.historySentToCustomer}
                        </span>
                      )}
                    </div>
                    {/* Customer reply text — green tint */}
                    {h.note && isCustomerReply && (
                      <div className="mt-1 p-2 rounded-lg whitespace-pre-wrap"
                        style={{
                          background: 'rgba(34,197,94,0.08)',
                          color: 'var(--dash-text, #1a1a2e)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                        }}>
                        {h.note}
                      </div>
                    )}
                    {/* Ambiguous routing banner — surfaced when the reply
                        landed here via the recent-outbound heuristic but
                        another brand also messaged this phone in the
                        same window. Lets the agent re-attach to the
                        intended ticket. */}
                    {isCustomerReply && h.routing_meta?.ambiguous && (
                      <AmbiguityBanner
                        historyId={h.id}
                        meta={h.routing_meta}
                        username={username}
                        onMoved={fetchTicket}
                        lang={lang}
                      />
                    )}
                    {/* Brand notification body — cyan tint, exactly the
                        text the customer received over WhatsApp */}
                    {isBrandMessage && h.body_text && (
                      <div className="mt-1 p-2 rounded-lg whitespace-pre-wrap"
                        style={{
                          background: 'rgba(6,182,212,0.08)',
                          border: '1px solid rgba(6,182,212,0.2)',
                          color: 'var(--dash-text, #1a1a2e)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                        }}>
                        {h.body_text}
                      </div>
                    )}
                    {/* Agent free-form message / image caption — emerald tint */}
                    {isAgentDirect && h.body_text && (
                      <div className="mt-1 p-2 rounded-lg whitespace-pre-wrap"
                        style={{
                          background: 'rgba(16,185,129,0.08)',
                          border: '1px solid rgba(16,185,129,0.2)',
                          color: 'var(--dash-text, #1a1a2e)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                        }}>
                        {h.body_text}
                      </div>
                    )}
                    {/* Customer feedback — issue body in amber tint, positive
                        is just the badge above (no body text). */}
                    {isFeedback && h.note === 'issue' && h.body_text && (
                      <div className="mt-1 p-2 rounded-lg whitespace-pre-wrap"
                        style={{
                          background: 'rgba(251,191,36,0.10)',
                          border: '1px solid rgba(251,191,36,0.3)',
                          color: 'var(--dash-text, #1a1a2e)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                        }}>
                        {h.body_text}
                      </div>
                    )}
                    {/* Internal note text — neutral tint, brand-only */}
                    {h.note && h.action === 'note_added' && (
                      <div className="mt-1 p-2 rounded-lg whitespace-pre-wrap"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          color: 'var(--dash-text, #1a1a2e)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                        }}>
                        {h.note}
                      </div>
                    )}
                    {h.attachment_url && (
                      <a
                        href={h.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1 text-xs underline"
                        style={{ color: '#883fe2' }}
                      >
                        {t.attachmentPrefix} {h.attachment_filename || t.attachmentFallback}
                      </a>
                    )}
                    <div className="opacity-60 mt-0.5">
                      {formatRelative(h.created_at, lang)} · {h.actor || '—'}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Send dialog */}
      {showSendDialog && (
        <SendDialog
          template={showSendDialog}
          lang={lang}
          ticket={ticket}
          influencer={influencer}
          username={username}
          sending={sending}
          onClose={() => setShowSendDialog(null)}
          onSend={(extra) => handleSendTemplate(showSendDialog, extra)}
        />
      )}

      {/* Danger zone — admin-only delete */}
      {agent?.is_admin && (
        <div
          className="mt-2 p-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs" style={{ color: '#9ca3af' }}>
              <span className="font-semibold" style={{ color: '#fca5a5' }}>{t.dangerZone}</span>
              <span className="opacity-70">{t.dangerZoneNote}</span>
            </div>
            <button
              onClick={handleDeleteTicket}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Trash2 className="w-3.5 h-3.5" />
              {t.deleteTicket}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Focus shipment card — top-of-panel, prominent, auto-resolved       */
/* ------------------------------------------------------------------ */

interface FocusViewProps {
  found: boolean;
  shipmentNumber: string | null;
  statusText: string;
  isDelivered: boolean;
  isCanceled: boolean;
  isReturned: boolean;
  lastUpdate?: { date: string | null; time: string | null };
  destinationBranch?: string | null;
  shipmentDirection?: string | null;
}

function FocusShipmentCard({
  orderNumber: rawOrderNumber,
  view,
  state,
  lang,
  onRefresh,
}: {
  orderNumber: string | null;
  view: FocusViewProps | null;
  state: 'idle' | 'loading' | 'found' | 'pending' | 'error';
  lang: 'he' | 'en';
  onRefresh: () => void;
}) {
  const t = getDashboardStrings(lang).support;
  // Order numbers are stored in support_requests.order_number with the
  // exact form the customer typed — sometimes "186870", sometimes
  // "#186870". Strip any leading '#' so we render a single hash in our
  // display ("#186870"), never "##186870".
  const orderNumber = rawOrderNumber ? rawOrderNumber.replace(/^#+/, '') : null;
  // No order number on the ticket — nothing to look up. Render a small
  // hint so the brand knows why this card is empty.
  if (!orderNumber) {
    return (
      <div className="rounded-2xl p-4"
        style={{
          background: 'rgba(107,114,128,0.1)',
          border: '1px dashed rgba(107,114,128,0.4)',
        }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
          <Truck className="w-4 h-4" />
          <span>{t.focusNoOrder}</span>
        </div>
      </div>
    );
  }

  if (state === 'loading' || state === 'idle') {
    return (
      <div className="rounded-2xl p-5"
        style={{
          background: 'rgba(136,63,226,0.08)',
          border: '1px solid rgba(136,63,226,0.25)',
        }}>
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#883fe2' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--dash-text, #fff)' }}>
              {t.focusLoadingPrefix} <code dir="ltr">#{orderNumber}</code>...
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {t.focusLoadingSub}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div className="rounded-2xl p-5"
        style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.15)' }}>
              <Package className="w-5 h-5" style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--dash-text, #fff)' }}>
                {t.focusPendingTitle}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
                {t.focusPendingSubA} <code dir="ltr">#{orderNumber}</code>{t.focusPendingSubB}
              </div>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg flex-shrink-0"
            style={{ color: '#f59e0b' }}
            title={t.focusRetryTooltip}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-2xl p-5"
        style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Truck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--dash-text, #fff)' }}>
                {t.focusErrorTitle}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
                {t.focusErrorSub}
              </div>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg flex-shrink-0"
            style={{ color: '#ef4444' }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // state === 'found'
  if (!view || !view.shipmentNumber) return null;

  const dotColor = view.isDelivered
    ? '#22c55e'
    : view.isReturned
    ? '#f59e0b'
    : view.isCanceled
    ? '#ef4444'
    : '#06b6d4';
  const lightBg = view.isDelivered
    ? 'rgba(34,197,94,0.1)'
    : view.isReturned
    ? 'rgba(245,158,11,0.1)'
    : view.isCanceled
    ? 'rgba(239,68,68,0.1)'
    : 'rgba(6,182,212,0.1)';
  const border = view.isDelivered
    ? 'rgba(34,197,94,0.3)'
    : view.isReturned
    ? 'rgba(245,158,11,0.3)'
    : view.isCanceled
    ? 'rgba(239,68,68,0.3)'
    : 'rgba(6,182,212,0.3)';

  return (
    <div className="rounded-2xl p-5"
      style={{ background: lightBg, border: `1px solid ${border}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${dotColor}26` }}>
            <Truck className="w-6 h-6" style={{ color: dotColor }} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide opacity-70"
              style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {t.focusShipmentNumberLabel}
            </div>
            <div className="flex items-center gap-2">
              <code className="text-2xl font-bold tabular-nums" dir="ltr"
                style={{ color: 'var(--dash-text, #fff)' }}>
                {view.shipmentNumber}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(view.shipmentNumber || '')}
                className="opacity-60 hover:opacity-100"
                title={t.focusCopyTooltip}
                style={{ color: 'var(--dash-text-2, #9ca3af)' }}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[11px] mt-0.5"
              style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              {t.focusOrderPrefix} <code dir="ltr">#{orderNumber}</code> · {t.focusAutoResolved}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${dotColor}33`, color: dotColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
            {view.statusText}
          </span>
          <button
            onClick={onRefresh}
            className="p-1 rounded-md opacity-50 hover:opacity-100"
            title={t.focusRefreshTooltip}
            style={{ color: 'var(--dash-text-2, #9ca3af)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stage details — last scan, branch, direction */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {view.destinationBranch && (
          <div>
            <div className="opacity-70" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              {t.focusDestBranch}
            </div>
            <div className="mt-0.5 font-medium" style={{ color: 'var(--dash-text, #fff)' }}>
              {view.destinationBranch}
            </div>
          </div>
        )}
        {view.lastUpdate?.date && (
          <div>
            <div className="opacity-70" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              {t.focusLastUpdate}
            </div>
            <div className="mt-0.5 font-medium tabular-nums" style={{ color: 'var(--dash-text, #fff)' }}>
              {view.lastUpdate.date}{view.lastUpdate.time ? ` ${view.lastUpdate.time}` : ''}
            </div>
          </div>
        )}
        {view.shipmentDirection && (
          <div>
            <div className="opacity-70" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              {t.focusDeliveryType}
            </div>
            <div className="mt-0.5 font-medium" style={{ color: 'var(--dash-text, #fff)' }}>
              {view.shipmentDirection}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                         */
/* ------------------------------------------------------------------ */

function Pagination({
  page,
  pageSize,
  total,
  lang,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  lang: 'he' | 'en';
  onChange: (p: number) => void;
}) {
  const t = getDashboardStrings(lang).support;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  // Build a compact page-number list: [1, ..., page-1, page, page+1, ..., last]
  const pages: (number | 'gap')[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (page - 2 > 2) pages.push('gap');
  for (let p = Math.max(2, page - 1); p <= Math.min(lastPage - 1, page + 1); p++) add(p);
  if (page + 2 < lastPage - 1) pages.push('gap');
  if (lastPage > 1) add(lastPage);

  const fromIdx = (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
          {fromIdx}–{toIdx} {t.paginationOf} {total}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-2, #9ca3af)' }}
          >
            {t.paginationPrev}
          </button>
          {pages.map((p, i) => {
            if (p === 'gap') {
              return (
                <span key={`gap-${i}`} className="px-1.5 text-xs" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
                  …
                </span>
              );
            }
            const active = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p)}
                disabled={active}
                className="min-w-[32px] px-2 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: active ? '#883fe2' : 'rgba(255,255,255,0.05)',
                  color: active ? '#fff' : 'var(--dash-text-2, #9ca3af)',
                }}
              >
                {p}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dash-text-2, #9ca3af)' }}
          >
            {t.paginationNext}
          </button>
        </div>
      </div>
    </div>
  );
}

function AmbiguityBanner({
  historyId,
  meta,
  username,
  onMoved,
  lang,
}: {
  historyId: string;
  meta: RoutingMeta;
  username: string;
  onMoved: () => void;
  lang: 'he' | 'en';
}) {
  const t = getDashboardStrings(lang).support;
  const [moving, setMoving] = useState<string | null>(null);
  const handleMove = async (targetTicketId: string) => {
    setMoving(targetTicketId);
    try {
      const res = await fetch(`/api/influencer/${username}/support-tickets/move-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId, targetTicketId }),
      });
      const data = await res.json();
      if (data.ok) {
        onMoved();
      } else {
        alert(`${t.moveFailed} ${data.message || data.error || t.genericError}`);
      }
    } finally {
      setMoving(null);
    }
  };
  return (
    <div className="mt-1 p-2 rounded-lg flex flex-col gap-2"
      style={{
        background: 'rgba(217,119,6,0.08)',
        border: '1px solid rgba(217,119,6,0.3)',
      }}>
      <div className="flex items-start gap-1.5 text-[11px]" style={{ color: '#b45309' }}>
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        <span>
          {t.ambiguityText}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {meta.alternatives.map((alt) => (
          <button
            key={alt.ticket_id}
            onClick={() => handleMove(alt.ticket_id)}
            disabled={moving !== null}
            className="px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 disabled:opacity-50"
            style={{
              background: 'var(--dash-surface-solid, #fff)',
              color: 'var(--dash-text)',
              border: '1px solid var(--dash-border, rgba(0,0,0,0.1))',
            }}
          >
            {moving === alt.ticket_id && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>
              {alt.brand || t.ambiguityBrandFallback} · {alt.customer_name || t.ambiguityCustomerFallback} · {formatRelative(alt.last_outbound_at, lang)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NotifyButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
      style={{ background: '#883fe2', color: '#fff' }}
    >
      <Send className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function historyLine(h: HistoryEntry, lang: 'he' | 'en' = 'he'): string {
  const t = getDashboardStrings(lang).support;
  if (h.action === 'status_change') {
    const fromLabel = h.from_status ? statusLabel(h.from_status as TicketStatus, lang) || h.from_status : '?';
    const toLabel = h.to_status ? statusLabel(h.to_status as TicketStatus, lang) || h.to_status : '?';
    return `${t.historyStatusPrefix} ${fromLabel} → ${toLabel}${h.note ? ` · "${h.note}"` : ''}`;
  }
  if (h.action === 'note_added') return t.historyNoteUpdated;
  if (h.action === 'assigned') {
    if (h.actor === 'system') return `${t.historyAutoAssigned} ${h.note}`;
    return `${t.historyAssignedTo} ${h.note}`;
  }
  if (h.action === 'customer_notified') {
    const failed = h.note?.startsWith('Send failed');
    const TEMPLATE_LABEL: Record<string, string> = {
      support_status_in_progress: t.tmplInProgress,
      support_status_in_progress_v2: t.tmplInProgress,
      support_status_awaiting_customer: t.tmplAwaiting,
      support_status_awaiting_customer_v2: t.tmplAwaiting,
      support_status_shipped: t.tmplShipped,
      support_status_shipped_v2: t.tmplShipped,
      support_status_shipped_v3: t.tmplShipped,
      support_status_shipped_v4: t.tmplShipped,
      support_status_resolved: t.tmplResolved,
      support_status_resolved_v2: t.tmplResolved,
      support_freeform_message: t.tmplFreeform,
      follower_support_confirmation: t.tmplFollowerConfirm,
      brand_support_ticket: t.tmplBrandAlert,
    };
    const friendly = TEMPLATE_LABEL[h.whatsapp_template_name || ''] || h.whatsapp_template_name || t.historyMsgFallback;
    if (failed) return `${t.historySendAttemptFailed} (${friendly}) — ${h.note}`;
    return `${t.historyMsgToCustomer} ${friendly}`;
  }
  if (h.action === 'customer_reply') return t.historyCustomerReply;
  if (h.action === 'reply_moved_out') return t.historyReplyMovedOut;
  if (h.action === 'reply_moved_in') return t.historyReplyMovedIn;
  if (h.action === 'brand_notified') {
    const failed = h.note?.startsWith('Send failed');
    if (failed) return `${t.historyBrandAlertFailed} — ${h.note}`;
    return t.historyBrandAlertSent;
  }
  if (h.action === 'agent_message') {
    const failed = h.note?.startsWith('Send failed');
    if (failed) return `${t.historyAgentMsgFailed} — ${h.note}`;
    return t.historyAgentMsg;
  }
  if (h.action === 'agent_image') {
    const failed = h.note?.startsWith('Send failed');
    if (failed) return `${t.historyAgentImgFailed} — ${h.note}`;
    return t.historyAgentImg;
  }
  if (h.action === 'shipment_event') {
    const labels: Record<string, string> = {
      dispatched: t.shipDispatched,
      in_transit: t.shipInTransit,
      at_branch: t.shipAtBranch,
      out_for_delivery: t.shipOutForDelivery,
      delivered: t.shipDelivered,
      returned: t.shipReturned,
      cancelled: t.shipCancelled,
      failed_delivery: t.shipFailedDelivery,
      unknown: t.shipUnknown,
    };
    return `🚚 ${labels[h.note || 'unknown'] || labels.unknown}`;
  }
  if (h.action === 'customer_feedback') {
    if (h.note === 'positive') return t.historyFeedbackPositive;
    if (h.note === 'issue') return t.feedbackBadgeIssue;
    return t.historyFeedbackGeneric;
  }
  return h.action;
}

/* ------------------------------------------------------------------ */
/*  Send dialog — collects template-specific fields before dispatching */
/* ------------------------------------------------------------------ */

function SendDialog({
  template,
  lang,
  ticket,
  influencer,
  username,
  sending,
  onClose,
  onSend,
}: {
  template: 'in_progress' | 'awaiting_customer' | 'shipped' | 'resolved';
  lang: 'he' | 'en';
  ticket: Ticket;
  influencer: Influencer | null;
  username: string;
  sending: boolean;
  onClose: () => void;
  onSend: (extra: Record<string, string>) => void;
}) {
  const t = getDashboardStrings(lang).support;
  const etaOptions = [t.sendEta35Days, t.sendEtaThisWeek, t.sendEtaTomorrow, t.sendEta24h];
  const [requestedDetail, setRequestedDetail] = useState('');
  // v4 shipped template adds product name + ETA as variables (the
  // brand can personalise per send). Old v2/v3's hardcoded
  // "המוצר החלופי" / "בימים הקרובים" are now per-send fields.
  const [replacementProduct, setReplacementProduct] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState<string>(etaOptions[0]);
  const [trackingNumber, setTrackingNumber] = useState(ticket.tracking_number || '');
  const [resolutionSummary, setResolutionSummary] = useState(ticket.resolution_summary || t.sendResolutionDefault);
  const [resolvingTracking, setResolvingTracking] = useState(false);

  // Auto-resolve ship_no on dialog open if we're sending the "shipped"
  // template and the parent hasn't filled it in yet (e.g. user clicked
  // before the parent's auto-resolve finished).
  useEffect(() => {
    if (template !== 'shipped') return;
    if (trackingNumber) return;
    if (!ticket.order_number) return;
    let cancelled = false;
    (async () => {
      setResolvingTracking(true);
      try {
        const orderClean = ticket.order_number!.replace(/[^0-9]/g, '');
        const res = await fetch(
          `/api/shipment/status?username=${encodeURIComponent(username)}&reference=${encodeURIComponent(orderClean)}`,
        );
        const data = await res.json();
        if (!cancelled && res.ok && data.found && data.shipmentNumber) {
          setTrackingNumber(data.shipmentNumber);
        }
      } finally {
        if (!cancelled) setResolvingTracking(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, ticket.id]);

  const fname = ticket.customer_name?.split(/\s+/)[0] || t.sendCustomerFallback;
  const brand = ticket.brand || influencer?.display_name || t.sendBrandFallback;
  const code = shortCode(ticket.id);
  // v4 shipped template uses the customer-facing order number (not
  // the internal ticket short code) — strip leading '#' if present.
  const orderRef = (ticket.order_number || '').replace(/^#+/, '').trim() || code;

  const preview = useMemo(() => {
    const en = lang === 'en';
    switch (template) {
      case 'in_progress':
        return en
          ? `Hi ${fname} 👋\nYour request to ${brand} (#${code}) has been received and we're on it now ✨\nWe'll get back to you soon with an update. Thanks for your patience 🤍`
          : `היי ${fname} 👋\nהפנייה שלך ל-${brand} (#${code}) התקבלה ואנחנו מטפלים בה כעת ✨\nנחזור אליך בהקדם עם עדכון. תודה על הסבלנות 🤍`;
      case 'awaiting_customer':
        return en
          ? `Hi ${fname} 👋\nRegarding your request to ${brand} (#${code}) — we need one more detail from you to continue:\n${requestedDetail || '___'}\n\nYou can reply here or through the request form you filled out. Thanks 🤍`
          : `היי ${fname} 👋\nבנוגע לפנייה שלך ל-${brand} (#${code}) — אנחנו צריכים ממך פרט נוסף כדי להמשיך:\n${requestedDetail || '___'}\n\nאפשר להשיב כאן או דרך טופס הפנייה שמילאת. תודה 🤍`;
      case 'shipped':
        return en
          ? `Hi ${fname} 👋\nRegarding order ${orderRef} at ${brand} — we're sending you ${replacementProduct || '___'}, arriving ${estimatedDelivery || '___'}.\nFocus tracking number: ${trackingNumber || '___'}\nThank you for reaching out to ${brand} 🤍`
          : `היי ${fname} 👋\nבנוגע להזמנה ${orderRef} ב-${brand} — נשלח אלייך ${replacementProduct || '___'} אשר יסופק ${estimatedDelivery || '___'}.\nמספר משלוח Focus למעקב: ${trackingNumber || '___'}\nתודה שפנית ל-${brand} 🤍`;
      case 'resolved':
        return en
          ? `Hi ${fname} 👋\nYour request to ${brand} (#${code}) has been resolved ✅\n${resolutionSummary}\n\nIf there's anything else, we're here 🤍`
          : `היי ${fname} 👋\nהפנייה שלך ל-${brand} (#${code}) טופלה ✅\n${resolutionSummary}\n\nאם יש משהו נוסף, אנחנו כאן 🤍`;
    }
  }, [lang, template, fname, brand, code, orderRef, requestedDetail, replacementProduct, estimatedDelivery, trackingNumber, resolutionSummary]);

  const canSend = useMemo(() => {
    if (template === 'awaiting_customer') return requestedDetail.trim().length > 0;
    if (template === 'shipped') {
      return trackingNumber.trim().length > 0 && replacementProduct.trim().length > 0;
    }
    return true;
  }, [template, requestedDetail, trackingNumber, replacementProduct]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="max-w-lg w-full rounded-2xl p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto my-auto"
        style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        dir={lang === 'en' ? 'ltr' : 'rtl'}
      >
        <h3 className="text-lg font-semibold">{t.sendDialogTitle}</h3>

        {template === 'awaiting_customer' && (
          <div>
            <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>{t.sendWhichDetail}</div>
            <input
              type="text"
              value={requestedDetail}
              onChange={(e) => setRequestedDetail(e.target.value)}
              placeholder={t.sendDetailPlaceholder}
              className="w-full text-sm p-2.5 rounded-xl outline-none"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
          </div>
        )}

        {template === 'shipped' && (
          <>
            <div>
              <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>{t.sendReplacementLabel}</div>
              <input
                type="text"
                value={replacementProduct}
                onChange={(e) => setReplacementProduct(e.target.value)}
                placeholder={t.sendReplacementPlaceholder}
                className="w-full text-sm p-2.5 rounded-xl outline-none"
                style={{ background: 'rgba(255,255,255,0.05)' }}
                dir={lang === 'en' ? 'ltr' : 'rtl'}
              />
            </div>

            <div>
              <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>{t.sendEtaLabel}</div>
              <input
                type="text"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl outline-none"
                style={{ background: 'rgba(255,255,255,0.05)' }}
                dir={lang === 'en' ? 'ltr' : 'rtl'}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {etaOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setEstimatedDelivery(opt)}
                    className="px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                    style={{
                      background: estimatedDelivery === opt ? '#883fe2' : 'rgba(255,255,255,0.05)',
                      color: estimatedDelivery === opt ? '#fff' : '#9ca3af',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs" style={{ color: '#9ca3af' }}>{t.sendTrackingLabel}</div>
                {resolvingTracking && (
                  <span className="text-[11px] flex items-center gap-1" style={{ color: '#9ca3af' }}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.sendTrackingResolving}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={resolvingTracking ? t.sendTrackingPlaceholder : '3409393'}
                className="w-full text-sm p-2.5 rounded-xl outline-none"
                style={{ background: 'rgba(255,255,255,0.05)' }}
                dir="ltr"
              />
              {!trackingNumber && !resolvingTracking && (
                <p className="text-[11px] mt-1" style={{ color: '#fbbf24' }}>
                  {t.sendTrackingNotFound}
                </p>
              )}
            </div>
          </>
        )}

        {template === 'resolved' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs" style={{ color: '#9ca3af' }}>{t.sendResolutionLabel}</div>
              <div
                className="text-[11px]"
                style={{
                  color:
                    resolutionSummary.length > 850
                      ? '#fbbf24'
                      : resolutionSummary.length >= 900
                      ? '#ef4444'
                      : '#6b7280',
                }}
              >
                {resolutionSummary.length} / 900
              </div>
            </div>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value.slice(0, 900))}
              maxLength={900}
              rows={8}
              className="w-full text-sm p-3 rounded-xl outline-none resize-y min-h-[200px]"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              placeholder={t.sendResolutionPlaceholder}
            />
          </div>
        )}

        <div>
          <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>{t.sendPreviewLabel}</div>
          <pre className="whitespace-pre-wrap text-sm p-3 rounded-xl font-sans"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            {preview}
          </pre>
          <p className="text-[11px] mt-1.5 opacity-60">
            {t.sendWillBeSentTo}{ticket.customer_phone}.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}
          >
            {t.sendCancel}
          </button>
          <button
            onClick={() => {
              const extra: Record<string, string> = {};
              if (template === 'awaiting_customer') extra.requestedDetail = requestedDetail;
              if (template === 'shipped') {
                extra.trackingNumber = trackingNumber;
                extra.replacementProduct = replacementProduct;
                extra.estimatedDelivery = estimatedDelivery;
              }
              if (template === 'resolved') extra.resolutionSummary = resolutionSummary;
              onSend(extra);
            }}
            disabled={!canSend || sending}
            className="px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            style={{ background: '#883fe2', color: '#fff' }}
          >
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Send className="w-4 h-4" />
            {t.sendButton}
          </button>
        </div>
      </div>
    </div>
  );
}
