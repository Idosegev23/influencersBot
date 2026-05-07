'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { KpiCard } from '@/components/admin/KpiCard';
import { Card } from '@/components/ui/card';

type Range = '7' | '14' | '30' | '90';

interface Summary {
  accountId: string;
  days: number;
  series: Array<{
    date: string;
    visits: number;
    sessions: number;
    leads: number;
    support_tickets: number;
    coupon_copies: number;
    bounce_count: number;
    unique_visitors: number;
    new_visitors: number;
    returning_visitors: number;
    external_exits: number;
    back_to_ig: number;
    back_to_site: number;
    avg_duration_sec: number;
    messages_user: number;
    messages_bot: number;
  }>;
  totals: {
    visits: number;
    sessions: number;
    leads: number;
    support_tickets: number;
    coupon_copies: number;
    bounce_count: number;
    unique_visitors: number;
    new_visitors: number;
    returning_visitors: number;
    external_exits: number;
    back_to_ig: number;
    back_to_site: number;
    messages_user: number;
    messages_bot: number;
    avg_duration_sec: number;
    bounce_rate_pct: number;
  };
  breakdown: {
    ref_source: Array<{ source: string; visits: number }>;
    device: Array<{ device: string; visits: number }>;
  };
  funnel: Array<{ stage: string; count: number }>;
  gsc: {
    top_queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
    provisioning: { gsc_site_url: string | null; gsc_status: string; gsc_last_fetch: string | null } | null;
  };
  anomalies: Array<{
    id: number;
    metric: string;
    yesterday: number;
    baseline: number;
    delta_pct: number;
    severity: string;
    detected_on: string;
  }>;
  cost: { total_usd: number; tokens: number; api_calls: number };
}

const FUNNEL_LABELS: Record<string, string> = {
  visits: 'ביקורים',
  sessions: 'שיחות',
  engaged: 'שיחות עם אינטראקציה',
  leads_or_tickets: 'לידים + פניות תמיכה',
};

const EXIT_LABELS = [
  { key: 'external_exits', label: 'יציאות חיצוניות' },
  { key: 'back_to_ig', label: 'חזרה לאינסטגרם' },
  { key: 'back_to_site', label: 'חזרה לאתר' },
] as const;

export default function AdminAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [range, setRange] = useState<Range>('30');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/admin/analytics/summary?accountId=${id}&days=${range}`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j?.error || 'failed');
        setData(j);
      } catch (e: any) {
        if (alive) setError(e?.message || 'failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, range]);

  const exitData = useMemo(() => {
    if (!data) return [];
    return EXIT_LABELS.map(({ key, label }) => ({
      label,
      visits: (data.totals as any)[key] || 0,
    }));
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Link href={`/admin/influencers/${id}`} className="text-sm text-blue-600 hover:underline">
              ← חזרה לפרופיל
            </Link>
            <h1 className="text-2xl font-bold mt-1">אנליטיקס</h1>
          </div>
          <div className="flex items-center gap-2">
            <RangeButton current={range} value="7" setRange={setRange} />
            <RangeButton current={range} value="14" setRange={setRange} />
            <RangeButton current={range} value="30" setRange={setRange} />
            <RangeButton current={range} value="90" setRange={setRange} />
            <Link
              href={`/admin/influencers/${id}/analytics-setup`}
              className="text-xs text-gray-600 hover:text-gray-900 underline mr-2"
            >
              הגדרת GSC
            </Link>
          </div>
        </header>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        {data?.anomalies?.length ? (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="font-semibold text-amber-900 text-sm mb-2">
              {data.anomalies.length} התראות פתוחות
            </div>
            <ul className="text-sm space-y-1">
              {data.anomalies.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span>
                    {a.metric}: {a.yesterday} (Baseline {a.baseline})
                  </span>
                  <span className="font-mono text-xs text-amber-700">{a.delta_pct}%</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="ביקורים" value={fmt(data?.totals.visits)} loading={loading} />
          <KpiCard label="מבקרים ייחודיים" value={fmt(data?.totals.unique_visitors)} loading={loading} />
          <KpiCard
            label="חדשים / חוזרים"
            value={`${fmt(data?.totals.new_visitors)} / ${fmt(data?.totals.returning_visitors)}`}
            loading={loading}
          />
          <KpiCard label="שיחות" value={fmt(data?.totals.sessions)} loading={loading} />
          <KpiCard label="לידים" value={fmt(data?.totals.leads)} loading={loading} />
          <KpiCard label="פניות תמיכה" value={fmt(data?.totals.support_tickets)} loading={loading} />
          <KpiCard label="העתקות קופונים" value={fmt(data?.totals.coupon_copies)} loading={loading} />
          <KpiCard
            label="Bounce Rate"
            value={data ? `${data.totals.bounce_rate_pct}%` : '—'}
            loading={loading}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">ביקורים ושיחות לאורך זמן</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="visits" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="sessions" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">חדשים מול חוזרים</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="new_visitors" stackId="1" stroke="#6366f1" fill="#6366f1" />
                  <Area type="monotone" dataKey="returning_visitors" stackId="1" stroke="#a855f7" fill="#a855f7" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">פאנל המרה</h2>
            <ul className="space-y-2 text-sm">
              {data?.funnel.map((row, i) => {
                const top = data.funnel[0]?.count || 1;
                const pct = top > 0 ? Math.round((row.count / top) * 100) : 0;
                return (
                  <li key={row.stage}>
                    <div className="flex justify-between mb-1">
                      <span>{FUNNEL_LABELS[row.stage] || row.stage}</span>
                      <span className="text-gray-500">{row.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded">
                      <div className="h-full bg-indigo-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">יציאות</h2>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={exitData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="visits" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">מקורות תנועה</h2>
            <ul className="space-y-1 text-sm max-h-44 overflow-y-auto">
              {(data?.breakdown.ref_source || []).map((s) => (
                <li key={s.source} className="flex justify-between">
                  <span className="truncate">{s.source}</span>
                  <span className="text-gray-500 font-mono">{s.visits}</span>
                </li>
              ))}
              {!data?.breakdown.ref_source.length && <li className="text-gray-400">—</li>}
            </ul>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold">Search Console — Top Queries</h2>
              <span className="text-xs text-gray-500">{gscStatusLabel(data?.gsc.provisioning?.gsc_status)}</span>
            </div>
            {data?.gsc.top_queries.length ? (
              <table className="w-full text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-right pb-1">Query</th>
                    <th className="text-right pb-1">Clicks</th>
                    <th className="text-right pb-1">Imp.</th>
                    <th className="text-right pb-1">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gsc.top_queries.slice(0, 12).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1 truncate max-w-[180px]">{r.query}</td>
                      <td className="py-1 text-right font-mono">{r.clicks}</td>
                      <td className="py-1 text-right font-mono">{r.impressions}</td>
                      <td className="py-1 text-right font-mono">{Number(r.position).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-500">
                {data?.gsc.provisioning?.gsc_site_url
                  ? 'אין נתונים ל-7 הימים האחרונים. הסנכרון רץ ב-04:00 UTC כל יום.'
                  : (
                    <>
                      לא הוגדר GSC.{' '}
                      <Link href={`/admin/influencers/${id}/analytics-setup`} className="text-blue-600 underline">
                        הגדירו עכשיו
                      </Link>
                    </>
                  )}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">עלות LLM (Admin only)</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-gray-500">סה״כ</div>
                <div className="text-lg font-mono">${data?.cost.total_usd.toFixed(4) ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">טוקנים</div>
                <div className="text-lg font-mono">{fmt(data?.cost.tokens)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">קריאות</div>
                <div className="text-lg font-mono">{fmt(data?.cost.api_calls)}</div>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function RangeButton({ current, value, setRange }: { current: Range; value: Range; setRange: (r: Range) => void }) {
  const active = current === value;
  return (
    <button
      onClick={() => setRange(value)}
      className={`px-3 py-1 rounded text-xs ${active ? 'bg-black text-white' : 'bg-white border'}`}
    >
      {value}d
    </button>
  );
}

function fmt(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('he-IL');
}

function gscStatusLabel(s?: string): string {
  if (!s) return '';
  switch (s) {
    case 'connected': return 'מחובר ✓';
    case 'pending': return 'ממתין לסנכרון';
    case 'permission_denied': return 'אין הרשאה';
    case 'auth_failed': return 'שגיאת אימות';
    case 'disabled': return 'לא מוגדר';
    default: return s;
  }
}
