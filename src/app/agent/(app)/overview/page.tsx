'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const BUCKET_LABEL: Record<string, string> = { open: 'טרם נחתם', moved: 'הועבר לחודש אחר', cancelled: 'בוטל', signed: 'נחתם' };

function money(n: number, cur = 'ILS') {
  const s = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₪';
  return `${s} ${Number(n || 0).toLocaleString('en-US')}`;
}

function DealTable({ title, rows, showStatus }: { title: string; rows: any[]; showStatus?: boolean }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const comm = rows.reduce((s, r) => s + r.commission, 0);
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-[color:var(--line)] flex items-center justify-between gap-2">
        <span className="font-semibold text-[color:var(--ink-900)] text-sm">{title}</span>
        <span className="text-[12px] text-[color:var(--ink-500)] shrink-0">{rows.length} · {money(total)} · עמלה {money(comm)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-[color:var(--ink-400)]">אין</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[color:var(--ink-500)] text-[11px] border-b border-[color:var(--line)]">
                <th className="text-right px-4 py-2 font-medium">מותג / קמפיין</th>
                <th className="text-right px-3 py-2 font-medium">מיוצג</th>
                <th className="text-right px-3 py-2 font-medium">לקוח</th>
                <th className="text-left px-3 py-2 font-medium">סכום</th>
                <th className="text-left px-3 py-2 font-medium">עמלה</th>
                {showStatus && <th className="text-right px-3 py-2 font-medium">סטטוס</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[color:var(--ink-100)]">
                  <td className="px-4 py-2">
                    <Link href={`/agent/deals/${r.id}`} className="text-[color:var(--ink-800)] hover:text-[color:var(--brand)]">
                      {r.brand_name}{r.campaign_name ? ` · ${r.campaign_name}` : ''}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[color:var(--ink-600)]">{r.talent_name || '—'}</td>
                  <td className="px-3 py-2 text-[color:var(--ink-600)]">{r.client_name || '—'}</td>
                  <td className="px-3 py-2 text-left" dir="ltr">{money(r.amount, r.currency)}</td>
                  <td className="px-3 py-2 text-left text-[color:var(--ink-500)]" dir="ltr">{money(r.commission, r.currency)}</td>
                  {showStatus && <td className="px-3 py-2 text-[color:var(--ink-600)]">{BUCKET_LABEL[r.bucket]}{r.moved_to_month ? ` (${r.moved_to_month})` : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
      <div className="text-xl font-bold text-[color:var(--ink-900)]" dir="ltr">{value}</div>
      <div className="text-[12px] text-[color:var(--ink-500)] mt-1">{label}</div>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agent/overview').then((r) => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>;
  if (!data?.summary) return <div dir="rtl" className="text-sm text-red-600">שגיאה בטעינת הסקירה</div>;

  const s = data.summary;
  const t = data.tables;

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">סקירה</h1>
        <p className="text-sm text-[color:var(--ink-500)] mt-1">נתוני מכר, עמלות, וסטטוס פרויקטים</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="מכירות (נחתמו)" value={money(s.sales_total)} />
        <Kpi label={`עמלת מכירות (${s.default_commission_pct}%)`} value={money(s.commission_total)} />
        <Kpi label="עסקאות שנחתמו" value={String(s.signed_count)} />
        <Kpi label="ממתינות לחתימה" value={String(s.open_count)} />
      </div>

      <DealTable title="פרויקטים רב-חודשיים שנחתמו" rows={t.multi_signed} />
      <DealTable title="פרויקטים רב-חודשיים שטרם נחתמו / הועברו / בוטלו" rows={t.multi_not_signed} showStatus />
      <DealTable title="פרויקטים חד-חודשיים שנחתמו" rows={t.single_signed} />
      <DealTable title="פרויקטים חד-חודשיים שטרם נחתמו / הועברו / בוטלו" rows={t.single_not_signed} showStatus />
    </div>
  );
}
