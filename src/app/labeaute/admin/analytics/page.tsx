'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  ArrowRight,
  BarChart3,
  Clock,
  CheckCircle,
  Users,
  RefreshCw,
  LogOut,
  AlertCircle,
} from 'lucide-react';

const ACCOUNT_USERNAME = 'labeaute.israel';

const STATUS_LABEL: Record<string, string> = {
  new: 'חדשה',
  in_progress: 'בטיפול',
  awaiting_customer: 'ממתינה ללקוחה',
  shipped: 'נשלחה',
  resolved: 'טופלה',
  closed: 'סגורה',
  cancelled: 'בוטלה',
};

const ACTION_LABEL: Record<string, string> = {
  status_change: 'שינוי סטטוס',
  note_added: 'הערה נוספה',
  assigned: 'הקצאה',
  customer_notified: 'נשלחה הודעה ללקוחה',
  customer_reply: 'תגובת לקוחה',
};

type AgentRow = {
  id: string;
  display_name: string;
  is_admin: boolean;
  last_login_at: string | null;
  tickets_touched: number;
  tickets_resolved: number;
  tickets_assigned_open: number;
  avg_resolution_minutes: number | null;
};

type ActivityRow = {
  id: string;
  ticket_id: string;
  action: string;
  actor: string | null;
  actor_agent_id: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

type AnalyticsResponse = {
  window: { from: string; to: string };
  statusCounts: Record<string, number>;
  overall: { total: number; resolved: number; avg_resolution_minutes: number | null };
  agents: AgentRow[];
  activity: ActivityRow[];
};

function formatMinutes(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}ש ${rem}ד׳` : `${h} שעות`;
  const d = Math.floor(h / 24);
  return `${d} ימים`;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h}ש`;
  const d = Math.floor(h / 24);
  return `לפני ${d} ימים`;
}

export default function LabeauteAnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [agentDisplayName, setAgentDisplayName] = useState<string>('');

  const fromIso = useMemo(() => {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return from.toISOString();
  }, [days]);

  const fetchData = async () => {
    try {
      const url = new URL('/api/agent/analytics', window.location.origin);
      url.searchParams.set('accountUsername', ACCOUNT_USERNAME);
      url.searchParams.set('from', fromIso);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/labeaute/login');
        return;
      }
      if (res.status === 403) {
        setError('אין הרשאת אדמין');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError('טעינה נכשלה — נסי שוב');
        setLoading(false);
        return;
      }
      const payload = (await res.json()) as AnalyticsResponse;
      setData(payload);
      setError(null);
    } catch {
      setError('שגיאת רשת');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await fetch(`/api/agent/me?accountUsername=${ACCOUNT_USERNAME}`, { cache: 'no-store' });
        const meData = await me.json();
        if (!meData.authenticated) {
          router.replace('/labeaute/login');
          return;
        }
        if (!meData.agent.is_admin) {
          setError('אין הרשאת אדמין');
          setLoading(false);
          return;
        }
        setAgentDisplayName(meData.agent.display_name);
        await fetchData();
      } catch {
        setError('שגיאת רשת');
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    setRefreshing(true);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const handleLogout = async () => {
    try {
      await fetch('/api/agent/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountUsername: ACCOUNT_USERNAME }),
      });
    } catch {}
    router.push('/labeaute/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b0b0f' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: '#0b0b0f', color: '#fff' }}
      >
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto" style={{ color: '#ef4444' }} />
          <p>{error}</p>
          <button
            onClick={() => router.push(`/influencer/${ACCOUNT_USERNAME}/support`)}
            className="px-4 py-2 rounded-xl text-sm"
            style={{ background: '#883fe2', color: '#fff' }}
          >
            חזרה לפניות
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: '#0b0b0f', color: '#fff' }}>
      <div className="max-w-7xl mx-auto p-4 space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/influencer/${ACCOUNT_USERNAME}/support`)}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
              title="חזרה לפניות"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <BarChart3 className="w-5 h-5" style={{ color: '#883fe2' }} />
            <h1 className="text-xl font-bold">אנליטיקת תמיכה</h1>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#883fe2', color: '#fff' }}>
              אדמין
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-sm p-2 rounded-lg outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <option value={7}>7 ימים אחרונים</option>
              <option value={30}>30 ימים אחרונים</option>
              <option value={90}>90 ימים אחרונים</option>
              <option value={365}>שנה אחרונה</option>
            </select>
            <button
              onClick={() => { setRefreshing(true); fetchData(); }}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <span className="text-xs hidden md:inline" style={{ color: '#9ca3af' }}>
              {agentDisplayName}
            </span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
              title="התנתק"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="סה״כ פניות" value={data.overall.total.toString()} />
          <KpiCard icon={<CheckCircle className="w-4 h-4" />} label="טופלו" value={data.overall.resolved.toString()} />
          <KpiCard
            icon={<Clock className="w-4 h-4" />}
            label="זמן טיפול ממוצע"
            value={formatMinutes(data.overall.avg_resolution_minutes)}
          />
          <KpiCard icon={<Users className="w-4 h-4" />} label="סוכנות פעילות" value={data.agents.length.toString()} />
        </div>

        {/* Status breakdown */}
        <Section title="התפלגות סטטוסים">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <div
                key={k}
                className="px-3 py-2 rounded-xl text-xs"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <div style={{ color: '#9ca3af' }}>{label}</div>
                <div className="text-lg font-semibold mt-1">{data.statusCounts[k] || 0}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Per-agent breakdown */}
        <Section title="פירוט לפי סוכנת">
          <div className="overflow-x-auto rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <table className="w-full text-sm">
              <thead style={{ color: '#9ca3af', fontSize: 12 }}>
                <tr>
                  <th className="text-right p-3 font-medium">שם</th>
                  <th className="text-center p-3 font-medium">פניות שטיפלה</th>
                  <th className="text-center p-3 font-medium">סגרה</th>
                  <th className="text-center p-3 font-medium">פתוחות אצלה</th>
                  <th className="text-center p-3 font-medium">זמן ממוצע לסגירה</th>
                  <th className="text-center p-3 font-medium hidden md:table-cell">כניסה אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="p-3">
                      <span className="font-medium">{a.display_name}</span>
                      {a.is_admin && (
                        <span className="mr-2 px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#883fe2', color: '#fff' }}>
                          אדמין
                        </span>
                      )}
                    </td>
                    <td className="text-center p-3">{a.tickets_touched}</td>
                    <td className="text-center p-3">{a.tickets_resolved}</td>
                    <td className="text-center p-3">{a.tickets_assigned_open}</td>
                    <td className="text-center p-3">{formatMinutes(a.avg_resolution_minutes)}</td>
                    <td className="text-center p-3 hidden md:table-cell" style={{ color: '#9ca3af' }}>
                      {a.last_login_at ? formatRelative(a.last_login_at) : '—'}
                    </td>
                  </tr>
                ))}
                {data.agents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center" style={{ color: '#9ca3af' }}>
                      אין סוכנות פעילות עדיין.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Recent activity */}
        <Section title="פעילות אחרונה (25 פעולות)">
          <ol className="space-y-2">
            {data.activity.map((row) => (
              <li
                key={row.id}
                className="px-3 py-2 rounded-xl text-xs flex items-start gap-2"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#883fe2' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: '#fff' }}>{row.actor || '—'}</span>
                    <span style={{ color: '#9ca3af' }}>{ACTION_LABEL[row.action] || row.action}</span>
                    {row.action === 'status_change' && row.from_status && row.to_status && (
                      <span style={{ color: '#9ca3af' }}>
                        {STATUS_LABEL[row.from_status] || row.from_status} → {STATUS_LABEL[row.to_status] || row.to_status}
                      </span>
                    )}
                    {row.note && (
                      <span style={{ color: '#9ca3af' }} className="truncate">— {row.note}</span>
                    )}
                  </div>
                  <div className="text-[11px] opacity-60 mt-0.5">{formatRelative(row.created_at)}</div>
                </div>
              </li>
            ))}
            {data.activity.length === 0 && (
              <li className="p-6 text-center rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af' }}>
                אין פעילות בתקופה הזו.
              </li>
            )}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="p-4 rounded-2xl"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-center gap-2 text-xs mb-2" style={{ color: '#9ca3af' }}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold" style={{ color: '#9ca3af' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
