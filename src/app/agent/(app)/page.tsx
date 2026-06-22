'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileSignature, Receipt, AlertTriangle, Briefcase, ArrowLeft } from 'lucide-react';

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

export default function AgentDashboard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agent/partnerships')
      .then((r) => r.json())
      .then((d) => setDeals(d.deals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const pendingSig = deals.filter((d) => d.signature && d.signature.status !== 'signed' && d.status === 'proposal').length;
  const activeDeals = deals.filter((d) => d.status === 'active').length;
  const awaitingInvoice = deals.filter((d) => d.invoice?.status === 'draft').length;
  const overdue = deals.filter((d) => d.invoice && !d.invoice.paid_at && d.invoice.due_date && d.invoice.due_date < today && d.invoice.status !== 'paid').length;

  // attention queue
  const attention = deals.filter(
    (d) =>
      (d.signature && d.signature.status !== 'signed' && d.status === 'proposal') ||
      d.invoice?.status === 'draft' ||
      (d.invoice && !d.invoice.paid_at && d.invoice.due_date && d.invoice.due_date < today)
  );

  const kpis = [
    { label: 'ממתינות לחתימה', value: pendingSig, icon: FileSignature },
    { label: 'פעילויות פעילות', value: activeDeals, icon: Briefcase },
    { label: 'ממתינות לחשבונית', value: awaitingInvoice, icon: Receipt },
    { label: 'בפיגור תשלום', value: overdue, icon: AlertTriangle },
  ];

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">דשבורד</h1>
        <p className="text-sm text-[color:var(--ink-500)] mt-1">מבט-על על הפעילות שלך</p>
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
                    <Icon className="w-5 h-5 text-[color:var(--brand)]" />
                    <span className="text-2xl font-bold text-[color:var(--ink-900)]">{k.value}</span>
                  </div>
                  <div className="text-[12px] text-[color:var(--ink-500)] mt-2">{k.label}</div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--line)] flex items-center justify-between">
              <span className="font-semibold text-[color:var(--ink-900)]">דורש טיפול</span>
              <Link href="/agent/deals" className="text-[12px] text-[color:var(--brand)] hover:underline flex items-center gap-1">
                כל העסקאות <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>
            {attention.length === 0 ? (
              <div className="p-8 text-center text-[color:var(--ink-500)] text-sm">הכול מטופל ✨</div>
            ) : (
              <div className="divide-y divide-[color:var(--line)]">
                {attention.map((d) => (
                  <Link key={d.id} href={`/agent/deals/${d.id}`} className="flex items-center justify-between p-3 hover:bg-[color:var(--ink-100)] transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-[color:var(--ink-900)] truncate">{d.brand_name} {d.client_name ? `· ${d.client_name}` : ''}</div>
                      <div className="text-[12px] text-[color:var(--ink-500)]">{attentionReason(d, today)}</div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-[color:var(--ink-400)] shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function attentionReason(d: Deal, today: string): string {
  if (d.signature && d.signature.status !== 'signed' && d.status === 'proposal') return 'ממתין לחתימת הצעה';
  if (d.invoice?.status === 'draft') return 'ממתין להעלאת חשבונית';
  if (d.invoice && !d.invoice.paid_at && d.invoice.due_date && d.invoice.due_date < today) return `תשלום בפיגור (${d.invoice.due_date})`;
  return '';
}
