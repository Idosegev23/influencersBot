'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, Copy, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';

interface Client {
  id: string;
  display_name: string;
}

export default function NewQuotePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ signUrl: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    account_id: '',
    brand_name: '',
    campaign_name: '',
    amount: '',
    currency: 'ILS',
    valid_until: '',
    deliverables: '',
    terms: '',
    brand_contact_name: '',
    brand_contact_email: '',
  });

  useEffect(() => {
    fetch('/api/agent/clients')
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.account_id) return setError('בחר/י לקוח');
    if (!form.brand_name.trim()) return setError('שם המותג נדרש');
    setSaving(true);
    try {
      const res = await fetch('/api/agent/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) setResult({ signUrl: data.signUrl, title: data.title });
      else setError(data.error || 'שגיאה');
    } catch {
      setError('שגיאה ביצירה');
    } finally {
      setSaving(false);
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.signUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const input = 'ui-input';

  if (result) {
    return (
      <div dir="rtl" className="max-w-xl">
        <PageHeader eyebrow="הצעת מחיר" title="ההצעה נוצרה ✓" description="שלח/י את קישור החתימה ללקוח. חתימה = הסכם." />
        <div className="p-4 rounded-xl border border-[color:var(--brand)]/30 bg-[color:var(--brand)]/5">
          <div className="text-sm font-semibold text-[color:var(--ink-900)] mb-2">{result.title}</div>
          <div className="flex items-center gap-2">
            <input readOnly value={result.signUrl} className="ui-input flex-1 text-[13px]" dir="ltr" />
            <button onClick={copy} className="ui-btn ui-btn-sm ui-btn-solid gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'הועתק' : 'העתק'}
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <a href={result.signUrl} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-sm ui-btn-outline">
              פתח קישור חתימה ↗
            </a>
            <button onClick={() => router.push('/agent/quotes')} className="ui-btn ui-btn-sm ui-btn-ghost gap-1.5">
              <ArrowRight className="w-4 h-4" /> לכל ההצעות
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-2xl">
      <PageHeader eyebrow="חדש" title="הצעת מחיר חדשה" description="צור הצעה, שלח לחתימה — חתימה הופכת אותה להסכם." />
      <form onSubmit={submit} className="grid gap-4">
        <label className="block">
          <span className="block text-[12px] text-[color:var(--ink-600)] mb-1.5">לקוח / משפיען *</span>
          <select className={input} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">בחר/י לקוח…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>
          {clients.length === 0 && (
            <span className="text-[12px] text-[color:var(--ink-400)]">אין לקוחות — הוסף/י לקוח קודם במסך הלקוחות.</span>
          )}
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <Labeled label="מותג *">
            <input className={input} value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} />
          </Labeled>
          <Labeled label="קמפיין">
            <input className={input} value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} />
          </Labeled>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Labeled label="סכום">
            <input className={input} type="number" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Labeled>
          <Labeled label="מטבע">
            <select className={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="ILS">₪ ILS</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
            </select>
          </Labeled>
          <Labeled label="בתוקף עד">
            <input className={input} type="date" dir="ltr" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
          </Labeled>
        </div>

        <Labeled label="תוצרים (שורה לכל תוצר)">
          <textarea className={input} rows={3} value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} placeholder={'2 רילסים\n3 סטוריז'} />
        </Labeled>

        <Labeled label="תנאים">
          <textarea className={input} rows={2} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </Labeled>

        <div className="grid sm:grid-cols-2 gap-4">
          <Labeled label="איש קשר במותג (לחתימה)">
            <input className={input} value={form.brand_contact_name} onChange={(e) => setForm({ ...form, brand_contact_name: e.target.value })} />
          </Labeled>
          <Labeled label="אימייל איש הקשר">
            <input className={input} type="email" dir="ltr" value={form.brand_contact_email} onChange={(e) => setForm({ ...form, brand_contact_email: e.target.value })} />
          </Labeled>
        </div>

        {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}

        <div>
          <button type="submit" disabled={saving} className="ui-btn ui-btn-solid gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            צור הצעה + קישור חתימה
          </button>
        </div>
      </form>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-[color:var(--ink-600)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
