'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Inbox, MessageSquare, Mail, ExternalLink, Check } from 'lucide-react';

interface InboundMsg {
  id: string;
  channel: string;
  sender: string;
  subject: string | null;
  preview: string;
  parse_status: string;
  brand: string | null;
  amount: number | null;
  currency: string | null;
  needs_client: boolean;
  partnership_id: string | null;
  sign_token: string | null;
  error: string | null;
  created_at: string;
}

export default function InboxPage() {
  const [items, setItems] = useState<InboundMsg[]>([]);
  const [clients, setClients] = useState<{ id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/agent/inbound${onlyNeeds ? '?filter=needs_client' : ''}`);
    const d = await res.json();
    setItems(d.inbound || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyNeeds]);
  useEffect(() => {
    fetch('/api/agent/clients').then((r) => r.json()).then((d) => setClients(d.clients || [])).catch(() => {});
  }, []);

  const convert = async (id: string) => {
    const accountId = pick[id];
    if (!accountId) return;
    setAssigning(id);
    try {
      const res = await fetch(`/api/agent/inbound/${id}/convert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: accountId }),
      });
      await res.json();
      await load();
    } finally {
      setAssigning(null);
    }
  };

  const needsCount = items.filter((i) => i.needs_client).length;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">תיבה נכנסת</h1>
          <p className="text-sm text-[color:var(--ink-500)] mt-1">הצעות שהועברו אליך בוואטסאפ ובמייל</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-[color:var(--ink-600)] cursor-pointer">
          <input type="checkbox" checked={onlyNeeds} onChange={(e) => setOnlyNeeds(e.target.checked)} />
          רק דורשות שיוך {needsCount > 0 && !onlyNeeds && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700">{needsCount}</span>}
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--ink-500)]">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>אין הודעות נכנסות. העבר/י הצעה לוואטסאפ או למייל של בסטי.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m.id} className="p-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[color:var(--ink-100)] flex items-center justify-center shrink-0">
                  {m.channel === 'whatsapp' ? <MessageSquare className="w-4 h-4 text-green-600" /> : <Mail className="w-4 h-4 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[color:var(--ink-900)]">{m.brand || m.subject || 'הצעה'}</span>
                    {m.amount ? <span className="text-[12px] text-[color:var(--ink-600)]" dir="ltr">{Number(m.amount).toLocaleString('en-US')} {m.currency || 'ILS'}</span> : null}
                    {m.parse_status === 'failed' && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-red-100 text-red-700">ניתוח נכשל</span>}
                    {m.needs_client && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700">דורש שיוך לקוח</span>}
                    {m.partnership_id && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-green-100 text-green-700">הומר להצעה</span>}
                  </div>
                  <div className="text-[12px] text-[color:var(--ink-500)] mt-1" dir="ltr">{m.sender} · {new Date(m.created_at).toLocaleString('he-IL')}</div>
                  {m.preview && <p className="text-[13px] text-[color:var(--ink-600)] mt-2 line-clamp-2">{m.preview}</p>}

                  {m.needs_client && (
                    <div className="flex items-center gap-2 mt-3">
                      <select className="ui-input flex-1 max-w-xs" value={pick[m.id] || ''} onChange={(e) => setPick({ ...pick, [m.id]: e.target.value })}>
                        <option value="">בחר/י לקוח…</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                      </select>
                      <button disabled={!pick[m.id] || assigning === m.id} onClick={() => convert(m.id)} className="ui-btn ui-btn-sm ui-btn-solid gap-1.5">
                        {assigning === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        צור הצעה
                      </button>
                    </div>
                  )}
                  {m.partnership_id && (
                    <div className="flex items-center gap-2 mt-3">
                      <Link href={`/agent/deals/${m.partnership_id}`} className="ui-btn ui-btn-sm ui-btn-outline gap-1.5">פתח עסקה</Link>
                      {m.sign_token && <a href={`/sign/${m.sign_token}`} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-sm ui-btn-ghost gap-1.5"><ExternalLink className="w-3.5 h-3.5" />קישור חתימה</a>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
