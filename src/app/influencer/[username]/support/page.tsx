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
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

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
  last_customer_notified_at: string | null;
  tracking_number: string | null;
  resolution_summary: string | null;
  resolved_at: string | null;
  products?: { name: string; coupon_code: string | null; brand: string | null } | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  whatsapp_template_name: string | null;
  whatsapp_message_id: string | null;
  actor: string | null;
  created_at: string;
  attachment_url?: string | null;
  attachment_filename?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Status config                                                      */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'חדש',
  in_progress: 'בטיפול',
  awaiting_customer: 'ממתין ללקוחה',
  shipped: 'יצא למשלוח',
  resolved: 'טופל',
  closed: 'סגור',
  cancelled: 'בוטל',
};

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

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  if (d < 7) return `לפני ${d} ימים`;
  return new Date(iso).toLocaleDateString('he-IL');
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

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | TicketStatus>('new');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Boot: auth + load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }
        const inf = await getInfluencerByUsername(username);
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

  // Refetch on filter change
  useEffect(() => {
    if (!influencer) return;
    fetchList(filter, search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchList = useCallback(async (statusFilter: typeof filter, q: string) => {
    const url = new URL(`/api/influencer/${username}/support-tickets`, window.location.origin);
    if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
    if (q.trim()) url.searchParams.set('q', q.trim());
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const data = await res.json();
    setTickets(data.tickets || []);
    setCounts(data.counts || {});
  }, [username]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchList(filter, search);
    setRefreshing(false);
  };

  const handleSearch = async () => {
    await fetchList(filter, search);
  };

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">פניות תמיכה</h1>
            <p className="text-sm" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {counts.new || 0} חדשות · {counts.in_progress || 0} בטיפול · {counts.shipped || 0} במשלוח · סה״כ {counts.all || 0}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg"
            style={{ color: 'var(--dash-text-2, #9ca3af)' }}
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <div className="mb-4 flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Search className="w-4 h-4" style={{ color: 'var(--dash-text-3, #6b7280)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="חיפוש לפי שם, טלפון, מספר הזמנה, או טקסט בפנייה..."
              className="flex-1 bg-transparent outline-none text-sm"
              dir="rtl"
              style={{ color: 'var(--dash-text, #fff)' }}
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#883fe2', color: '#fff' }}
          >
            חפש
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {([
            { key: 'all', label: 'הכל' },
            { key: 'new', label: 'חדש' },
            { key: 'in_progress', label: 'בטיפול' },
            { key: 'awaiting_customer', label: 'ממתין ללקוחה' },
            { key: 'shipped', label: 'יצא למשלוח' },
            { key: 'resolved', label: 'טופל' },
            { key: 'closed', label: 'סגור' },
            { key: 'cancelled', label: 'בוטל' },
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
            <h2 className="text-xl font-semibold mb-2">אין פניות בסטטוס הזה</h2>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
            <TicketList
              tickets={tickets}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <div className="lg:sticky lg:top-4 self-start">
              {selectedId ? (
                <TicketDetail
                  username={username}
                  ticketId={selectedId}
                  influencer={influencer}
                  onChange={() => fetchList(filter, search)}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <div className="hidden lg:flex items-center justify-center p-12 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ color: 'var(--dash-text-3, #6b7280)' }}>בחר פנייה לצפייה בפרטים ולעדכון</p>
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
}: {
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2 max-h-[80vh] overflow-y-auto pr-1">
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
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <p className="text-sm line-clamp-2 mb-2" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              {t.message}
            </p>
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              <span>{formatRelative(t.created_at)}</span>
              {t.order_number && <span>#{t.order_number}</span>}
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
  onChange,
  onClose,
}: {
  username: string;
  ticketId: string;
  influencer: Influencer | null;
  onChange: () => void;
  onClose: () => void;
}) {
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

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/influencer/${username}/support-tickets/${ticketId}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTicket(data.ticket);
    setHistory(data.history || []);
    setInternalNotes(data.ticket?.internal_notes || '');
    setTrackingNumber(data.ticket?.tracking_number || '');
    setResolutionSummary(data.ticket?.resolution_summary || '');
    setLoading(false);
  }, [username, ticketId]);

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
        alert(`שליחה נכשלה: ${data.error || 'שגיאה'}`);
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
    <div className="p-5 rounded-2xl space-y-5 max-h-[80vh] overflow-y-auto"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: c.bg, color: c.text }}
            >
              <Icon className="w-3.5 h-3.5" />
              {STATUS_LABEL[ticket.status]}
            </span>
            <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
              #{shortCode(ticket.id)}
            </code>
          </div>
          <h3 className="text-lg font-semibold">{ticket.customer_name}</h3>
          <p className="text-xs" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
            התקבלה {formatRelative(ticket.created_at)}
          </p>
        </div>
        <button onClick={onClose} className="lg:hidden" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Focus shipment status — most important info, lives at the top.
          Auto-resolves when a ticket is opened: takes the order_number
          from the ticket, calls Focus, displays the actual ship_no plus
          live delivery state. */}
      <FocusShipmentCard
        orderNumber={ticket.order_number}
        view={focusView}
        state={focusState}
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
            <span>הזמנה: <code>{ticket.order_number}</code></span>
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
            מותג: <span style={{ color: 'var(--dash-text, #fff)' }}>{ticket.brand}</span>
          </div>
        )}
        {ticket.ref_source && (
          <div className="text-xs" style={{ color: '#883fe2' }}>↗ הגיעה דרך: {ticket.ref_source}</div>
        )}
      </div>

      {/* Original message */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>הודעה מקורית</div>
        <pre className="whitespace-pre-wrap text-sm p-3 rounded-xl font-sans" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {ticket.message}
        </pre>
      </div>

      {/* Status actions */}
      <div className="space-y-2">
        <div className="text-xs" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>שינוי סטטוס</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => {
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
                {STATUS_LABEL[s]}
                {savingStatus === s && <Loader2 className="w-3 h-3 animate-spin" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Customer notification (WhatsApp) */}
      <div className="rounded-xl p-3"
        style={{ background: 'rgba(136,63,226,0.1)', border: '1px solid rgba(136,63,226,0.25)' }}>
        <div className="text-xs mb-2 font-semibold" style={{ color: '#c084fc' }}>שליחת עדכון ללקוחה (WhatsApp)</div>
        <div className="flex flex-wrap gap-2">
          <NotifyButton label="התחלנו לטפל" onClick={() => setShowSendDialog('in_progress')} disabled={!ticket.customer_phone} />
          <NotifyButton label="צריכים פרטים" onClick={() => setShowSendDialog('awaiting_customer')} disabled={!ticket.customer_phone} />
          <NotifyButton label="יצא למשלוח" onClick={() => setShowSendDialog('shipped')} disabled={!ticket.customer_phone} />
          <NotifyButton label="הפנייה טופלה" onClick={() => setShowSendDialog('resolved')} disabled={!ticket.customer_phone} />
        </div>
        {!ticket.customer_phone && (
          <p className="text-[11px] mt-2 opacity-70">אין מספר טלפון בפנייה — אי אפשר לשלוח עדכון WhatsApp.</p>
        )}
        {ticket.last_customer_notified_at && (
          <p className="text-[11px] mt-2 opacity-70">
            עדכון אחרון נשלח ללקוחה: {formatRelative(ticket.last_customer_notified_at)}
          </p>
        )}
      </div>

      {/* Editable details */}
      <div className="space-y-3">
        <div>
          <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>הערות פנימיות (לא מוצגות ללקוחה)</div>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="פרטי טיפול, נציג שטיפל, החלטות..."
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
              מספר משלוח Focus (אופציונלי — אם קיבלת מערוץ אחר)
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
            <div className="text-xs mb-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>סיכום הטיפול</div>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="מה נעשה לסגירת הפנייה (יוצג ללקוחה אם תשלחי הודעת WhatsApp 'הפנייה טופלה')"
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
          שמירה
        </button>
      </div>

      {/* History — chronological feed including customer replies */}
      {history.length > 0 && (
        <div>
          <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
            <History className="w-3.5 h-3.5" />
            היסטוריה ושיחה
          </div>
          <ol className="space-y-3 text-xs">
            {history.map((h) => {
              const isCustomerReply = h.action === 'customer_reply';
              return (
                <li key={h.id} className="flex gap-2 items-start">
                  <span
                    className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                    style={{ background: isCustomerReply ? '#22c55e' : '#883fe2' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span style={{ color: 'var(--dash-text-2, #9ca3af)' }}>{historyLine(h)}</span>
                      {isCustomerReply && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                          תגובה חדשה
                        </span>
                      )}
                    </div>
                    {h.note && (isCustomerReply || h.action === 'note_added') && (
                      <div className="mt-1 p-2 rounded-lg whitespace-pre-wrap"
                        style={{
                          background: isCustomerReply ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                          color: 'var(--dash-text, #fff)',
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
                        קובץ מצורף: {h.attachment_filename || 'קובץ'}
                      </a>
                    )}
                    <div className="opacity-60 mt-0.5">
                      {formatRelative(h.created_at)} · {h.actor || '—'}
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
          ticket={ticket}
          influencer={influencer}
          username={username}
          sending={sending}
          onClose={() => setShowSendDialog(null)}
          onSend={(extra) => handleSendTemplate(showSendDialog, extra)}
        />
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
  orderNumber,
  view,
  state,
  onRefresh,
}: {
  orderNumber: string | null;
  view: FocusViewProps | null;
  state: 'idle' | 'loading' | 'found' | 'pending' | 'error';
  onRefresh: () => void;
}) {
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
          <span>אין מספר הזמנה בפנייה — אי אפשר לאתר משלוח אוטומטית.</span>
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
              מאתר ב-Focus לפי הזמנה <code dir="ltr">#{orderNumber}</code>...
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
              מאחזר את מספר המשלוח האמיתי וסטטוס מהמערכת של חברת השילוח.
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
                ההזמנה עדיין לא יצאה למשלוח
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
                Focus עוד לא קיבלו את הזמנה <code dir="ltr">#{orderNumber}</code>. ברגע שהיא תצא — מספר המשלוח יופיע כאן אוטומטית.
              </div>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg flex-shrink-0"
            style={{ color: '#f59e0b' }}
            title="נסי שוב"
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
                שגיאה בקבלת סטטוס המשלוח מ-Focus
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--dash-text-2, #9ca3af)' }}>
                לחיצה על Refresh תנסה שוב.
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
              מספר משלוח Focus
            </div>
            <div className="flex items-center gap-2">
              <code className="text-2xl font-bold tabular-nums" dir="ltr"
                style={{ color: 'var(--dash-text, #fff)' }}>
                {view.shipmentNumber}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(view.shipmentNumber || '')}
                className="opacity-60 hover:opacity-100"
                title="העתק"
                style={{ color: 'var(--dash-text-2, #9ca3af)' }}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[11px] mt-0.5"
              style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              הזמנה <code dir="ltr">#{orderNumber}</code> · ↻ אותר אוטומטית
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
            title="רענן"
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
              סניף יעד
            </div>
            <div className="mt-0.5 font-medium" style={{ color: 'var(--dash-text, #fff)' }}>
              {view.destinationBranch}
            </div>
          </div>
        )}
        {view.lastUpdate?.date && (
          <div>
            <div className="opacity-70" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              עדכון אחרון
            </div>
            <div className="mt-0.5 font-medium tabular-nums" style={{ color: 'var(--dash-text, #fff)' }}>
              {view.lastUpdate.date}{view.lastUpdate.time ? ` ${view.lastUpdate.time}` : ''}
            </div>
          </div>
        )}
        {view.shipmentDirection && (
          <div>
            <div className="opacity-70" style={{ color: 'var(--dash-text-3, #6b7280)' }}>
              סוג מסירה
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

function historyLine(h: HistoryEntry): string {
  if (h.action === 'status_change') {
    const fromLabel = h.from_status ? STATUS_LABEL[h.from_status as TicketStatus] || h.from_status : '?';
    const toLabel = h.to_status ? STATUS_LABEL[h.to_status as TicketStatus] || h.to_status : '?';
    return `סטטוס: ${fromLabel} → ${toLabel}${h.note ? ` · "${h.note}"` : ''}`;
  }
  if (h.action === 'note_added') return `הערה פנימית עודכנה`;
  if (h.action === 'assigned') return `הוקצה ל: ${h.note}`;
  if (h.action === 'customer_notified') {
    const ok = !h.note?.startsWith('Send failed');
    return `${ok ? 'נשלחה' : 'ניסיון לשלוח'} הודעת WhatsApp: ${h.whatsapp_template_name || '?'}${ok ? '' : ` (${h.note})`}`;
  }
  if (h.action === 'customer_reply') return `תגובת הלקוחה`;
  return h.action;
}

/* ------------------------------------------------------------------ */
/*  Send dialog — collects template-specific fields before dispatching */
/* ------------------------------------------------------------------ */

function SendDialog({
  template,
  ticket,
  influencer,
  username,
  sending,
  onClose,
  onSend,
}: {
  template: 'in_progress' | 'awaiting_customer' | 'shipped' | 'resolved';
  ticket: Ticket;
  influencer: Influencer | null;
  username: string;
  sending: boolean;
  onClose: () => void;
  onSend: (extra: Record<string, string>) => void;
}) {
  const [requestedDetail, setRequestedDetail] = useState('');
  const [whatWasShipped, setWhatWasShipped] = useState('מוצר חלופי');
  const [trackingNumber, setTrackingNumber] = useState(ticket.tracking_number || '');
  const [resolutionSummary, setResolutionSummary] = useState(ticket.resolution_summary || 'הטיפול הושלם.');
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

  const fname = ticket.customer_name?.split(/\s+/)[0] || 'לקוחה';
  const brand = ticket.brand || influencer?.display_name || 'המותג';
  const code = shortCode(ticket.id);

  const preview = useMemo(() => {
    switch (template) {
      case 'in_progress':
        return `היי ${fname} 👋\nהפנייה שלך ל-${brand} (#${code}) התקבלה ואנחנו מטפלים בה כעת ✨\nנחזור אליך בהקדם עם עדכון. תודה על הסבלנות 🤍`;
      case 'awaiting_customer':
        return `היי ${fname} 👋\nבנוגע לפנייה שלך ל-${brand} (#${code}) — אנחנו צריכים ממך פרט נוסף כדי להמשיך:\n${requestedDetail || '___'}\n\nאפשר להשיב כאן או דרך טופס הפנייה שמילאת. תודה 🤍`;
      case 'shipped':
        return `היי ${fname} 👋\nבנוגע לפנייה שלך ל-${brand} (#${code}) — שלחנו לך בדואר ${whatWasShipped}.\nמספר משלוח Focus למעקב: ${trackingNumber || '___'}\nמקווים שהכל יסתדר 🤍`;
      case 'resolved':
        return `היי ${fname} 👋\nהפנייה שלך ל-${brand} (#${code}) טופלה ✅\n${resolutionSummary}\n\nאם יש משהו נוסף, אנחנו כאן 🤍`;
    }
  }, [template, fname, brand, code, requestedDetail, whatWasShipped, trackingNumber, resolutionSummary]);

  const canSend = useMemo(() => {
    if (template === 'awaiting_customer') return requestedDetail.trim().length > 0;
    if (template === 'shipped') return trackingNumber.trim().length > 0;
    return true;
  }, [template, requestedDetail, trackingNumber]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="max-w-lg w-full rounded-2xl p-5 space-y-4"
        style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        dir="rtl">
        <h3 className="text-lg font-semibold">שליחת הודעת WhatsApp ללקוחה</h3>

        {template === 'awaiting_customer' && (
          <div>
            <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>איזה פרט חסר?</div>
            <input
              type="text"
              value={requestedDetail}
              onChange={(e) => setRequestedDetail(e.target.value)}
              placeholder="לדוגמה: תמונה של המוצר הפגום"
              className="w-full text-sm p-2.5 rounded-xl outline-none"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
          </div>
        )}

        {template === 'shipped' && (
          <>
            <div>
              <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>מה נשלח</div>
              <input
                type="text"
                value={whatWasShipped}
                onChange={(e) => setWhatWasShipped(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl outline-none"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs" style={{ color: '#9ca3af' }}>מספר משלוח Focus</div>
                {resolvingTracking && (
                  <span className="text-[11px] flex items-center gap-1" style={{ color: '#9ca3af' }}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    מאתר ב-Focus...
                  </span>
                )}
              </div>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={resolvingTracking ? 'מאתר...' : '3409393'}
                className="w-full text-sm p-2.5 rounded-xl outline-none"
                style={{ background: 'rgba(255,255,255,0.05)' }}
                dir="ltr"
              />
              {!trackingNumber && !resolvingTracking && (
                <p className="text-[11px] mt-1" style={{ color: '#fbbf24' }}>
                  לא נמצא מספר משלוח אוטומטית — ייתכן שההזמנה עוד לא יצאה. אפשר להזין ידנית.
                </p>
              )}
            </div>
          </>
        )}

        {template === 'resolved' && (
          <div>
            <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>סיכום הטיפול</div>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              className="w-full text-sm p-3 rounded-xl outline-none resize-y min-h-[80px]"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
          </div>
        )}

        <div>
          <div className="text-xs mb-1.5" style={{ color: '#9ca3af' }}>תצוגה מקדימה (כפי שיראה הלקוחה)</div>
          <pre className="whitespace-pre-wrap text-sm p-3 rounded-xl font-sans"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            {preview}
          </pre>
          <p className="text-[11px] mt-1.5 opacity-60">
            ההודעה תישלח ל-{ticket.customer_phone}.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}
          >
            ביטול
          </button>
          <button
            onClick={() => {
              const extra: Record<string, string> = {};
              if (template === 'awaiting_customer') extra.requestedDetail = requestedDetail;
              if (template === 'shipped') {
                extra.whatWasShipped = whatWasShipped;
                extra.trackingNumber = trackingNumber;
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
            שלח
          </button>
        </div>
      </div>
    </div>
  );
}
