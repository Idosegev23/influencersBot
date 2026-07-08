'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Briefcase } from 'lucide-react';

interface Deal {
  id: string;
  brand_name: string;
  status: string;
  client_name: string | null;
  contract_amount: number | null;
  proposal_amount: number | null;
  currency: string | null;
  invoice: { status: string; due_date: string | null; paid_at: string | null } | null;
  signature: { status: string } | null;
}

const DEAL_STATUS: Record<string, string> = {
  proposal: 'הצעה', negotiation: 'מו״מ', contract: 'חוזה', active: 'פעיל', completed: 'הושלם', cancelled: 'בוטל', lead: 'ליד',
};

function paymentLabel(d: Deal, today: string): string {
  if (!d.invoice) return d.status === 'active' ? 'ממתין לסיום פעילות' : '—';
  if (d.invoice.status === 'draft') return 'ממתין לחשבונית';
  if (d.invoice.paid_at || d.invoice.status === 'paid') return 'שולם ✓';
  if (d.invoice.due_date && d.invoice.due_date < today) return `בפיגור (${d.invoice.due_date})`;
  return `ממתין לתשלום${d.invoice.due_date ? ` עד ${d.invoice.due_date}` : ''}`;
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetch('/api/agent/partnerships')
      .then((r) => r.json())
      .then((d) => setDeals(d.deals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">הסכמים</h1>
        <p className="text-sm text-[color:var(--ink-500)] mt-1">הצעות שנשלחו, נחתמו ופעילות — צנרת ההסכמים</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>
      ) : deals.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--ink-500)]">
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>אין עדיין הסכמים. צור/י הצעת מחיר כדי להתחיל.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--line)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[color:var(--ink-500)] text-[12px] border-b border-[color:var(--line)]">
                <th className="text-start p-3 font-medium">מותג</th>
                <th className="text-start p-3 font-medium">לקוח</th>
                <th className="text-start p-3 font-medium">סטטוס</th>
                <th className="text-start p-3 font-medium">סכום</th>
                <th className="text-start p-3 font-medium">תשלום</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-[color:var(--line)] last:border-0 hover:bg-[color:var(--ink-100)]">
                  <td className="p-3"><Link href={`/agent/deals/${d.id}`} className="font-medium text-[color:var(--ink-900)] hover:underline">{d.brand_name}</Link></td>
                  <td className="p-3 text-[color:var(--ink-600)]">{d.client_name || '—'}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full text-[11px] bg-[color:var(--ink-100)] text-[color:var(--ink-700)]">{DEAL_STATUS[d.status] || d.status}</span></td>
                  <td className="p-3 text-[color:var(--ink-700)]" dir="ltr">{d.contract_amount || d.proposal_amount ? `${Number(d.contract_amount || d.proposal_amount).toLocaleString('en-US')} ${d.currency || 'ILS'}` : '—'}</td>
                  <td className="p-3 text-[color:var(--ink-600)]">{paymentLabel(d, today)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
