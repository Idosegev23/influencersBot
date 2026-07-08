'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, Clock, AlertTriangle, Receipt } from 'lucide-react';

interface Deal {
  id: string;
  brand_name: string;
  status: string;
  client_name: string | null;
  contract_amount: number | null;
  proposal_amount: number | null;
  currency: string | null;
  invoice: { status: string; due_date: string | null; paid_at: string | null; total_amount: number | null } | null;
}

function money(n: number, cur = 'ILS') {
  const s = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₪';
  return `${s} ${Number(n || 0).toLocaleString('en-US')}`;
}

const today = () => new Date().toISOString().slice(0, 10);

type PayState = 'paid' | 'overdue' | 'awaiting' | 'draft';
function payStateOf(d: Deal): PayState | null {
  const inv = d.invoice;
  if (!inv && d.status !== 'active') return null; // not yet at the payment stage
  if (inv?.paid_at || inv?.status === 'paid') return 'paid';
  if (inv?.status === 'draft' || !inv) return 'draft';
  if (inv?.due_date && inv.due_date < today() && !inv.paid_at) return 'overdue';
  return 'awaiting';
}
const amountOf = (d: Deal) => Number(d.invoice?.total_amount ?? d.contract_amount ?? d.proposal_amount ?? 0);

const STATE_LABEL: Record<PayState, string> = { paid: 'שולם', overdue: 'בפיגור', awaiting: 'ממתין לתשלום', draft: 'ממתין לחשבונית' };
const STATE_CLASS: Record<PayState, string> = {
  paid: 'text-[color:var(--success)] bg-[color:var(--success)]/10',
  overdue: 'text-[color:var(--danger)] bg-[color:var(--danger)]/10',
  awaiting: 'text-[color:var(--brand)] bg-[color:var(--brand)]/10',
  draft: 'text-[color:var(--ink-500)] bg-[color:var(--ink-100)]',
};

export default function PaymentsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agent/partnerships').then((r) => r.json()).then((d) => setDeals(d.deals || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const rows = deals
    .map((d) => ({ d, state: payStateOf(d) }))
    .filter((x): x is { d: Deal; state: PayState } => x.state !== null)
    .sort((a, b) => {
      const order: Record<PayState, number> = { overdue: 0, awaiting: 1, draft: 2, paid: 3 };
      return order[a.state] - order[b.state];
    });

  const sum = (st: PayState) => rows.filter((r) => r.state === st).reduce((s, r) => s + amountOf(r.d), 0);
  const kpis = [
    { label: 'שולם', value: money(sum('paid')), icon: CheckCircle2 },
    { label: 'ממתין לתשלום', value: money(sum('awaiting')), icon: Clock },
    { label: 'בפיגור', value: money(sum('overdue')), icon: AlertTriangle },
    { label: 'ממתין לחשבונית', value: String(rows.filter((r) => r.state === 'draft').length), icon: Receipt },
  ];

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">תשלומים</h1>
        <p className="text-sm text-[color:var(--ink-500)] mt-1">חשבוניות ותשלומים לפי סטטוס</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
                  <div className="flex items-center justify-between">
                    <Icon className="w-5 h-5 text-[color:var(--ink-400)]" />
                    <span className="text-xl font-bold text-[color:var(--ink-900)]" dir="ltr">{k.value}</span>
                  </div>
                  <div className="text-[12px] text-[color:var(--ink-500)] mt-2">{k.label}</div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-[color:var(--ink-500)] text-sm">אין תשלומים לעקוב אחריהם עדיין</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[color:var(--ink-500)] text-[11px] border-b border-[color:var(--line)]">
                      <th className="text-right px-4 py-2 font-medium">מותג</th>
                      <th className="text-right px-3 py-2 font-medium">מיוצג</th>
                      <th className="text-left px-3 py-2 font-medium">סכום</th>
                      <th className="text-right px-3 py-2 font-medium">מועד תשלום</th>
                      <th className="text-right px-3 py-2 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--line)]">
                    {rows.map(({ d, state }) => (
                      <tr key={d.id} className="hover:bg-[color:var(--ink-100)]">
                        <td className="px-4 py-2">
                          <Link href={`/agent/deals/${d.id}`} className="text-[color:var(--ink-800)] hover:text-[color:var(--brand)]">{d.brand_name}</Link>
                        </td>
                        <td className="px-3 py-2 text-[color:var(--ink-600)]">{d.client_name || '—'}</td>
                        <td className="px-3 py-2 text-left" dir="ltr">{money(amountOf(d), d.currency || 'ILS')}</td>
                        <td className="px-3 py-2 text-[color:var(--ink-600)]" dir="ltr">{d.invoice?.due_date || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
