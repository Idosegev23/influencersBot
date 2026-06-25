'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Check, Circle, Copy, ExternalLink } from 'lucide-react';

interface Beat { id: string; title: string; status: string; due_date: string | null; completed_at: string | null; }
interface Detail {
  partnership: any;
  client_name: string | null;
  beats: Beat[];
  invoice: any | null;
  signature: { token: string; status: string; signed_at: string | null } | null;
}

const PURPLE = '#883fe2';

export default function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [docs, setDocs] = useState<{ id: string; filename: string; document_type: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newBeat, setNewBeat] = useState({ title: '', due_date: '' });
  const [reqOpts, setReqOpts] = useState({ payment_route: 'via_agency', payment_terms_days: 30 });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/agent/partnerships/${id}`);
    const data = await res.json();
    setD(data);
    fetch(`/api/agent/documents?partnershipId=${id}`)
      .then((r) => r.json())
      .then((dd) => setDocs(dd.documents || []))
      .catch(() => {});
    setLoading(false);
  }, [id]);

  const DOC_LABEL: Record<string, string> = { quote: 'הצעת מחיר', contract: 'הסכם חתום', invoice: 'חשבונית', brief: 'בריף', receipt: 'קבלה', other: 'מסמך' };

  useEffect(() => { load(); }, [load]);

  const act = async (payload: any) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/agent/partnerships/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      await res.json();
      await load();
      return res.ok;
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[color:var(--brand)]" /></div>;
  if (!d || !d.partnership) return <div className="text-center py-20 text-[color:var(--ink-500)]">העסקה לא נמצאה.</div>;

  const p = d.partnership;
  const inv = d.invoice;
  const today = new Date().toISOString().slice(0, 10);
  const amount = p.contract_amount || p.proposal_amount;

  return (
    <div dir="rtl" className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[color:var(--ink-900)]">{p.brand_name}</h1>
        <p className="text-sm text-[color:var(--ink-500)] mt-1">
          {d.client_name ? `${d.client_name} · ` : ''}{amount ? `${Number(amount).toLocaleString('en-US')} ${p.currency || 'ILS'}` : ''}
        </p>
      </div>

      {/* Signature status */}
      {d.signature && (
        <Section title="הצעה / חתימה">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[color:var(--ink-700)]">
              {d.signature.status === 'signed' ? `נחתם ${d.signature.signed_at ? new Date(d.signature.signed_at).toLocaleDateString('he-IL') : ''} ✓` : 'ממתין לחתימה'}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/sign/${d.signature!.token}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ui-btn ui-btn-sm ui-btn-ghost">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a href={`/sign/${d.signature.token}`} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-sm ui-btn-ghost"><ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </div>
        </Section>
      )}

      {/* Beats */}
      <Section title="פעימות (תכנון מול ביצוע)">
        {d.beats.length === 0 && <p className="text-[13px] text-[color:var(--ink-400)] mb-3">אין פעימות עדיין.</p>}
        <div className="space-y-1.5 mb-3">
          {d.beats.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[color:var(--ink-100)]">
              <button onClick={() => act({ action: 'toggle_beat', task_id: b.id, done: b.status !== 'completed' })} disabled={busy}>
                {b.status === 'completed' ? <Check className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5 text-[color:var(--ink-300)]" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] ${b.status === 'completed' ? 'line-through text-[color:var(--ink-400)]' : 'text-[color:var(--ink-800)]'}`}>{b.title}</div>
                <div className="text-[11px] text-[color:var(--ink-400)]">
                  {b.due_date ? `תוכנן: ${new Date(b.due_date).toLocaleDateString('he-IL')}` : 'ללא תאריך'}
                  {b.completed_at ? ` · בוצע: ${new Date(b.completed_at).toLocaleDateString('he-IL')}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="ui-input flex-1" placeholder="פעימה חדשה" value={newBeat.title} onChange={(e) => setNewBeat({ ...newBeat, title: e.target.value })} />
          <input className="ui-input" type="date" dir="ltr" value={newBeat.due_date} onChange={(e) => setNewBeat({ ...newBeat, due_date: e.target.value })} />
          <button disabled={busy || !newBeat.title.trim()} onClick={async () => { if (await act({ action: 'add_beat', title: newBeat.title, due_date: newBeat.due_date || null })) setNewBeat({ title: '', due_date: '' }); }} className="ui-btn ui-btn-sm ui-btn-solid"><Plus className="w-4 h-4" /></button>
        </div>
      </Section>

      {/* Invoice / payment */}
      <Section title="חשבונית ותשלום">
        {!inv ? (
          <div>
            <p className="text-[13px] text-[color:var(--ink-600)] mb-3">בסיום הפעילות — סמן/י "בוצע" כדי לבקש העלאת חשבונית. תזכורות יישלחו כל 48 שעות עד שתועלה.</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="block text-[11px] text-[color:var(--ink-500)] mb-1">מסלול תשלום</span>
                <select className="ui-input" value={reqOpts.payment_route} onChange={(e) => setReqOpts({ ...reqOpts, payment_route: e.target.value })}>
                  <option value="via_agency">דרך הסוכנות</option>
                  <option value="direct_from_brand">ישירות מהמותג</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] text-[color:var(--ink-500)] mb-1">תנאי תשלום (ימים)</span>
                <input className="ui-input w-24" type="number" dir="ltr" value={reqOpts.payment_terms_days} onChange={(e) => setReqOpts({ ...reqOpts, payment_terms_days: Number(e.target.value) })} />
              </label>
              <button disabled={busy} onClick={() => act({ action: 'request_invoice', ...reqOpts })} className="ui-btn ui-btn-solid">סמן בוצע ובקש חשבונית</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Row label="סטטוס" value={
              inv.status === 'draft' ? 'ממתין להעלאת חשבונית' :
              inv.status === 'paid' ? 'שולם ✓' :
              inv.status === 'overdue' ? `בפיגור (${inv.due_date})` :
              `ממתין לתשלום${inv.due_date ? ` עד ${inv.due_date}` : ''}`
            } />
            <Row label="מסלול" value={inv.payment_route === 'direct_from_brand' ? 'ישירות מהמותג' : 'דרך הסוכנות'} />
            {inv.status === 'draft' && inv.upload_token && (
              <>
                <div className="flex items-center gap-2">
                  <input readOnly className="ui-input flex-1 text-[12px]" dir="ltr" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invoice/${inv.upload_token}`} />
                  <a href={`/invoice/${inv.upload_token}`} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-sm ui-btn-outline">קישור העלאה ↗</a>
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={busy} onClick={() => act({ action: 'resend_invoice_upload_link' })} className="ui-btn ui-btn-sm ui-btn-ghost">שלח לי שוב את הקישור</button>
                  <button disabled={busy} onClick={() => { if (confirm('לבטל את בקשת החשבונית?')) act({ action: 'cancel_invoice' }); }} className="ui-btn ui-btn-sm ui-btn-ghost text-[color:var(--danger)]">בטל בקשה</button>
                </div>
              </>
            )}
            {inv.status !== 'paid' && inv.status !== 'draft' && (
              <button disabled={busy} onClick={() => act({ action: 'mark_paid', invoice_id: inv.id })} className="ui-btn ui-btn-solid">סמן כשולם</button>
            )}
          </div>
        )}
      </Section>

      {/* Documents */}
      {docs.length > 0 && (
        <Section title="מסמכים">
          <div className="space-y-1.5">
            {docs.map((doc) => (
              <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-[color:var(--ink-100)] text-[13px]">
                <span className="text-[color:var(--ink-800)]">{DOC_LABEL[doc.document_type] || doc.document_type}</span>
                <span className="text-[color:var(--brand)] flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />צפייה</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Plan vs actual */}
      <Section title="תכנון מול ביצוע">
        <Row label="נחתם" value={p.contract_signed_date || '—'} />
        <Row label="פעילות הושלמה" value={p.activity_completed_at ? new Date(p.activity_completed_at).toLocaleDateString('he-IL') : '—'} />
        <Row label="סכום מתוכנן" value={p.proposal_amount ? `${Number(p.proposal_amount).toLocaleString('en-US')} ${p.currency || 'ILS'}` : '—'} />
        <Row label="שולם בפועל" value={inv?.paid_at ? `${Number(inv.total_amount).toLocaleString('en-US')} ${inv.currency || 'ILS'} (${inv.paid_at})` : '—'} />
        <Row label="פעימות" value={`${d.beats.filter((b) => b.status === 'completed').length}/${d.beats.length} בוצעו`} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4">
      <div className="text-[11px] tracking-wider uppercase text-[color:var(--ink-500)] mb-3 font-medium">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-[color:var(--ink-500)]">{label}</span>
      <span className="text-[color:var(--ink-800)] font-medium" dir="ltr">{value}</span>
    </div>
  );
}
