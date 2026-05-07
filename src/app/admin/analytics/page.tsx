'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Sparkline } from '@/components/ui/sparkline';
import { Card } from '@/components/ui/card';

interface Row {
  id: string;
  username: string;
  display_name: string;
  type: string;
  plan: string;
  status: string;
  anomalies: number;
  spark: number[];
  totals_7d: {
    visits: number;
    sessions: number;
    leads: number;
    support_tickets: number;
  };
}

type SortKey = 'visits' | 'sessions' | 'leads' | 'anomalies' | 'name';

export default function AdminAnalyticsIndexPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('visits');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/admin/analytics/index');
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j?.error || 'failed');
        setRows(j.rows || []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      out = out.filter(
        (r) => r.display_name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)
      );
    }
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'visits':
          return b.totals_7d.visits - a.totals_7d.visits;
        case 'sessions':
          return b.totals_7d.sessions - a.totals_7d.sessions;
        case 'leads':
          return b.totals_7d.leads - a.totals_7d.leads;
        case 'anomalies':
          return b.anomalies - a.anomalies;
        case 'name':
          return a.display_name.localeCompare(b.display_name, 'he');
      }
    });
    return out;
  }, [rows, filter, sortKey]);

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">אנליטיקס — כל החשבונות</h1>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="חיפוש…"
              className="px-3 py-1 border rounded text-sm"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="visits">מיון: ביקורים</option>
              <option value="sessions">מיון: שיחות</option>
              <option value="leads">מיון: לידים</option>
              <option value="anomalies">מיון: התראות</option>
              <option value="name">מיון: שם</option>
            </select>
          </div>
        </header>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-right p-3">חשבון</th>
                <th className="text-right p-3">סוג</th>
                <th className="text-right p-3">14d</th>
                <th className="text-right p-3">ביקורים 7d</th>
                <th className="text-right p-3">שיחות 7d</th>
                <th className="text-right p-3">לידים 7d</th>
                <th className="text-right p-3">תמיכה 7d</th>
                <th className="text-right p-3">התראות</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-400">
                    טוען…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-400">
                    אין חשבונות תואמים
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-medium">{r.display_name || '—'}</div>
                    <div className="text-xs text-gray-500">{r.username}</div>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{r.type}</td>
                  <td className="p-3">
                    <Sparkline values={r.spark} width={80} height={24} />
                  </td>
                  <td className="p-3 font-mono">{r.totals_7d.visits.toLocaleString('he-IL')}</td>
                  <td className="p-3 font-mono">{r.totals_7d.sessions.toLocaleString('he-IL')}</td>
                  <td className="p-3 font-mono">{r.totals_7d.leads.toLocaleString('he-IL')}</td>
                  <td className="p-3 font-mono">{r.totals_7d.support_tickets.toLocaleString('he-IL')}</td>
                  <td className="p-3">
                    {r.anomalies > 0 ? (
                      <span className="inline-block bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-medium">
                        {r.anomalies}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/influencers/${r.id}/analytics`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      פתח →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}
