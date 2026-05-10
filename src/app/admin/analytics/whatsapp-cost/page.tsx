'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronDown, ChevronUp, Loader2, MessageSquare, AlertCircle } from 'lucide-react';

interface BucketRow {
  key: string;
  label: string;
  count: number;
  billable: number;
  free: number;
  failed: number;
  cost_usd: number;
  cost_ils: number;
  category_breakdown: Record<string, number>;
}

interface AccountRow extends BucketRow {
  templates: BucketRow[];
}

interface CostData {
  dateRange: { days: number; sinceIso: string; untilIso: string };
  totals: {
    messages: number;
    billable: number;
    free: number;
    failed: number;
    cost_usd: number;
    cost_ils: number;
  };
  byAccount: AccountRow[];
  byTemplate: BucketRow[];
  byCategory: BucketRow[];
}

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtIls = (n: number) => `₪${n.toFixed(2)}`;
const fmtNum = (n: number) => n.toLocaleString('he-IL');

const CATEGORY_LABEL: Record<string, string> = {
  marketing: 'שיווק',
  utility: 'שירות (utility)',
  authentication: 'אימות',
  service: 'תוך חלון 24h',
  unknown: 'לא ידוע',
};

export default function AdminWhatsappCostPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/admin/analytics/whatsapp-cost?days=${days}`);
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
  }, [days]);

  const sortedTemplates = useMemo(() => data?.byTemplate ?? [], [data]);

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <Link
              href="/admin/analytics"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              <ChevronLeft className="w-4 h-4 ml-1" />
              חזרה ל-Analytics
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-emerald-600" />
              עלויות WhatsApp Cloud API
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              חישוב מבוסס pricing של מטא לכל הודעה (PMP). ערכי billable=false נספרים אבל לא מתחייבים בעלות.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">טווח:</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value={7}>7 ימים</option>
              <option value={14}>14 ימים</option>
              <option value={30}>30 יום</option>
              <option value={60}>60 יום</option>
              <option value={90}>90 יום</option>
              <option value={180}>180 יום</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            שגיאה בטעינת הנתונים: {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Top totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="הודעות יוצאות" value={fmtNum(data.totals.messages)} />
              <KpiCard label="חיוב בפועל" value={fmtNum(data.totals.billable)} sub={`${fmtNum(data.totals.free)} חינם · ${fmtNum(data.totals.failed)} נכשלו`} />
              <KpiCard label="עלות USD" value={fmtUsd(data.totals.cost_usd)} accent="emerald" />
              <KpiCard label="עלות ש״ח (משוער)" value={fmtIls(data.totals.cost_ils)} accent="emerald" />
            </div>

            {/* By Account — primary billing view, with per-template drilldown */}
            <Section
              title="לפי חשבון (לחיוב)"
              subtitle="לחיצה על שורה פותחת פירוט תבניות לאותו חשבון"
            >
              <AccountBillingTable rows={data.byAccount} />
            </Section>

            {/* By Template — flat across all accounts */}
            <Section title="לפי תבנית (כל החשבונות)">
              <BreakdownTable rows={sortedTemplates} firstColLabel="תבנית" />
            </Section>

            {/* By Category */}
            <Section title="לפי קטגוריית מטא">
              <BreakdownTable
                rows={data.byCategory.map((r) => ({ ...r, label: CATEGORY_LABEL[r.label] || r.label }))}
                firstColLabel="קטגוריה"
              />
            </Section>

            <p className="text-xs text-gray-500 mt-6">
              שערי המרה: USD לפי טבלת מטא ל-IL (utility $0.008, marketing $0.0379, authentication $0.0086, service חינם). שער ש״ח לפי {process.env.NEXT_PUBLIC_USD_ILS_RATE || '3.7'}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald';
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${accent === 'emerald' ? 'text-emerald-600' : 'text-gray-900'}`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {subtitle && <span className="text-xs text-gray-400">— {subtitle}</span>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">{children}</div>
    </div>
  );
}

function AccountBillingTable({ rows }: { rows: AccountRow[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!rows.length) {
    return <div className="p-4 text-sm text-gray-400 text-center">אין נתונים</div>;
  }
  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-xs">
        <tr>
          <th className="text-right px-4 py-2 font-medium">חשבון</th>
          <th className="text-left px-4 py-2 font-medium">הודעות</th>
          <th className="text-left px-4 py-2 font-medium">חיוב</th>
          <th className="text-left px-4 py-2 font-medium">חינם</th>
          <th className="text-left px-4 py-2 font-medium">נכשלו</th>
          <th className="text-left px-4 py-2 font-medium">USD</th>
          <th className="text-left px-4 py-2 font-medium">₪ (משוער)</th>
          <th className="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <FragmentRow
            key={r.key}
            row={r}
            isExpanded={!!expanded[r.key]}
            onToggle={() => toggle(r.key)}
          />
        ))}
      </tbody>
    </table>
  );
}

function FragmentRow({
  row,
  isExpanded,
  onToggle,
}: {
  row: AccountRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDrilldown = row.templates.length > 0;
  return (
    <>
      <tr
        className={hasDrilldown ? 'cursor-pointer hover:bg-gray-50' : ''}
        onClick={hasDrilldown ? onToggle : undefined}
      >
        <td className="px-4 py-2 text-gray-900 font-medium">{row.label}</td>
        <td className="px-4 py-2 text-gray-700 text-left tabular-nums">{fmtNum(row.count)}</td>
        <td className="px-4 py-2 text-gray-700 text-left tabular-nums">{fmtNum(row.billable)}</td>
        <td className="px-4 py-2 text-gray-400 text-left tabular-nums">{fmtNum(row.free)}</td>
        <td className="px-4 py-2 text-rose-500 text-left tabular-nums">
          {row.failed ? fmtNum(row.failed) : '—'}
        </td>
        <td className="px-4 py-2 text-emerald-600 text-left tabular-nums font-semibold">
          {fmtUsd(row.cost_usd)}
        </td>
        <td className="px-4 py-2 text-emerald-600 text-left tabular-nums">{fmtIls(row.cost_ils)}</td>
        <td className="px-2 py-2 text-gray-400">
          {hasDrilldown && (isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
        </td>
      </tr>
      {isExpanded && hasDrilldown && (
        <tr>
          <td colSpan={8} className="bg-gray-50/50 p-0">
            <div className="px-4 py-3">
              <div className="text-[11px] text-gray-500 mb-2">פירוט תבניות עבור {row.label}</div>
              <table className="w-full text-xs">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-right px-2 py-1 font-normal">תבנית</th>
                    <th className="text-left px-2 py-1 font-normal">הודעות</th>
                    <th className="text-left px-2 py-1 font-normal">חיוב</th>
                    <th className="text-left px-2 py-1 font-normal">חינם</th>
                    <th className="text-left px-2 py-1 font-normal">USD</th>
                    <th className="text-left px-2 py-1 font-normal">₪</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50">
                  {row.templates.map((t) => (
                    <tr key={t.key}>
                      <td className="px-2 py-1 text-gray-700">{t.label}</td>
                      <td className="px-2 py-1 text-gray-600 text-left tabular-nums">{fmtNum(t.count)}</td>
                      <td className="px-2 py-1 text-gray-600 text-left tabular-nums">{fmtNum(t.billable)}</td>
                      <td className="px-2 py-1 text-gray-400 text-left tabular-nums">{fmtNum(t.free)}</td>
                      <td className="px-2 py-1 text-emerald-600 text-left tabular-nums">{fmtUsd(t.cost_usd)}</td>
                      <td className="px-2 py-1 text-emerald-600 text-left tabular-nums">{fmtIls(t.cost_ils)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BreakdownTable({ rows, firstColLabel }: { rows: BucketRow[]; firstColLabel: string }) {
  if (!rows.length) {
    return <div className="p-4 text-sm text-gray-400 text-center">אין נתונים</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-xs">
        <tr>
          <th className="text-right px-4 py-2 font-medium">{firstColLabel}</th>
          <th className="text-left px-4 py-2 font-medium">הודעות</th>
          <th className="text-left px-4 py-2 font-medium">חיוב</th>
          <th className="text-left px-4 py-2 font-medium">חינם</th>
          <th className="text-left px-4 py-2 font-medium">נכשלו</th>
          <th className="text-left px-4 py-2 font-medium">USD</th>
          <th className="text-left px-4 py-2 font-medium">₪ (משוער)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="px-4 py-2 text-gray-900">{r.label}</td>
            <td className="px-4 py-2 text-gray-700 text-left tabular-nums">{fmtNum(r.count)}</td>
            <td className="px-4 py-2 text-gray-700 text-left tabular-nums">{fmtNum(r.billable)}</td>
            <td className="px-4 py-2 text-gray-400 text-left tabular-nums">{fmtNum(r.free)}</td>
            <td className="px-4 py-2 text-rose-500 text-left tabular-nums">{r.failed ? fmtNum(r.failed) : '—'}</td>
            <td className="px-4 py-2 text-emerald-600 text-left tabular-nums font-semibold">{fmtUsd(r.cost_usd)}</td>
            <td className="px-4 py-2 text-emerald-600 text-left tabular-nums">{fmtIls(r.cost_ils)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
