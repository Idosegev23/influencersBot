'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, FileText, ExternalLink, Copy, Check } from 'lucide-react';

interface Quote {
  id: string;
  token: string;
  title: string;
  status: 'pending' | 'opened' | 'signed' | 'expired' | 'cancelled';
  signed_at: string | null;
  created_at: string;
  signer_name: string | null;
  client_name: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'ממתין', cls: 'background:rgba(245,158,11,.12);color:#b45309' },
  opened: { label: 'נצפה', cls: 'background:rgba(37,99,235,.12);color:#1d4ed8' },
  signed: { label: 'נחתם', cls: 'background:rgba(16,185,129,.14);color:#047857' },
  expired: { label: 'פג תוקף', cls: 'background:rgba(120,113,108,.14);color:#57534e' },
  cancelled: { label: 'בוטל', cls: 'background:rgba(239,68,68,.12);color:#b91c1c' },
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agent/quotes')
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copyLink = (token: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">הצעות מחיר</h1>
          <p className="text-sm text-[color:var(--ink-500)] mt-1">צור הצעות, שלח לחתימה, עקוב אחר סטטוס</p>
        </div>
        <Link href="/agent/quotes/new" className="ui-btn ui-btn-sm ui-btn-solid gap-1.5">
          <Plus className="w-4 h-4" /> הצעה חדשה
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--ink-500)]">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>אין עדיין הצעות. צור/י את ההצעה הראשונה.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--line)]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[color:var(--ink-500)] text-[12px] border-b border-[color:var(--line)]">
                <th className="text-start p-3 font-medium">הצעה</th>
                <th className="text-start p-3 font-medium">לקוח</th>
                <th className="text-start p-3 font-medium">סטטוס</th>
                <th className="text-start p-3 font-medium">נחתם ע״י</th>
                <th className="text-start p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const st = STATUS[q.status] || STATUS.pending;
                return (
                  <tr key={q.id} className="border-b border-[color:var(--line)] last:border-0">
                    <td className="p-3 font-medium text-[color:var(--ink-900)]">{q.title}</td>
                    <td className="p-3 text-[color:var(--ink-600)]">{q.client_name || '—'}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded-full text-[11px]" style={cssToObj(st.cls)}>{st.label}</span></td>
                    <td className="p-3 text-[color:var(--ink-600)]">{q.signer_name || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => copyLink(q.token, q.id)} className="ui-btn ui-btn-sm ui-btn-ghost" title="העתק קישור">
                          {copiedId === q.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <a href={`/sign/${q.token}`} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-sm ui-btn-ghost" title="פתח">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function cssToObj(css: string): React.CSSProperties {
  const obj: any = {};
  css.split(';').forEach((d) => {
    const [k, v] = d.split(':');
    if (k && v) obj[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim();
  });
  return obj;
}
