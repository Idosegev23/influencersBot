'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { computeTotals, type LineItem } from '@/lib/crm/pricing';

type Row = { platform: string; deliverable_type: string; qty: number; unit_price: number; notes: string };

export default function BriefPricingPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();

  const [brief, setBrief] = useState<any>(null);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ signUrl: string } | null>(null);

  useEffect(() => {
    fetch(`/api/agent/briefs/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setBrief(d.brief);
        setRoster(d.roster || []);
        setAccountId(d.brief?.suggested_account_id || d.roster?.[0]?.id || '');
        setRows(
          (d.seed_line_items || []).map((x: any) => ({
            platform: x.platform || '',
            deliverable_type: x.deliverable_type || '',
            qty: x.qty || 1,
            unit_price: x.unit_price || 0,
            notes: x.notes || '',
          }))
        );
      })
      .catch(() => setError('שגיאה בטעינת הבריף'))
      .finally(() => setLoading(false));
  }, [id]);

  const totals = useMemo(() => computeTotals(rows as LineItem[]), [rows]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { platform: '', deliverable_type: '', qty: 1, unit_price: 0, notes: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/briefs/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          brand_name: brief?.brand_name,
          campaign_name: brief?.campaign_name,
          line_items: rows,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'שליחה נכשלה');
        return;
      }
      setResult({ signUrl: d.signUrl });
    } catch {
      setError('שגיאה בשליחה');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div dir="rtl" className="text-sm text-[color:var(--ink-500)]">טוען…</div>;
  if (!brief) return <div dir="rtl" className="text-sm text-red-600">{error || 'בריף לא נמצא'}</div>;

  if (result) {
    return (
      <div dir="rtl" className="max-w-lg space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <h2 className="font-semibold text-green-900">ההצעה נוצרה ✅</h2>
          <p className="text-sm text-green-800 mt-1">שלח/י את הקישור הזה למותג לחתימה:</p>
          <a href={result.signUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-700 underline break-all">
            {result.signUrl}
          </a>
        </div>
        <button onClick={() => router.push('/agent/deals')} className="ui-btn ui-btn-sm">
          לעסקאות
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--ink-900)]">{brief.brand_name}</h1>
        {brief.campaign_name && <p className="text-sm text-[color:var(--ink-500)]">{brief.campaign_name}</p>}
        {brief.amount ? (
          <p className="text-xs text-[color:var(--ink-400)] mt-1">
            סכום שזוהה בבריף: ~{Number(brief.amount).toLocaleString('en-US')} ₪ (לאימות ותמחור ידני)
          </p>
        ) : null}
        {brief.edit_notes && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <span className="font-semibold">הלקוח ביקש שינוי:</span> {brief.edit_notes}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 space-y-2">
        <label className="block text-sm font-medium text-[color:var(--ink-700)]">מיוצג</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
        >
          <option value="">בחר/י מיוצג…</option>
          {roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[color:var(--ink-700)]">תמחור תוצרים</h3>
          <button onClick={addRow} className="text-sm text-[color:var(--brand)]">
            + תוצר
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                value={r.deliverable_type}
                onChange={(e) => update(i, { deliverable_type: e.target.value })}
                placeholder="תוצר (ריל/סטורי/פוסט)"
                className="col-span-4 rounded-lg border border-[color:var(--line)] px-2 py-1.5 text-sm"
              />
              <input
                value={r.platform}
                onChange={(e) => update(i, { platform: e.target.value })}
                placeholder="פלטפורמה"
                className="col-span-2 rounded-lg border border-[color:var(--line)] px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={1}
                value={r.qty}
                onChange={(e) => update(i, { qty: Number(e.target.value) })}
                placeholder="כמות"
                className="col-span-2 rounded-lg border border-[color:var(--line)] px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={0}
                value={r.unit_price}
                onChange={(e) => update(i, { unit_price: Number(e.target.value) })}
                placeholder="מחיר ליחידה"
                className="col-span-3 rounded-lg border border-[color:var(--line)] px-2 py-1.5 text-sm"
              />
              <button onClick={() => removeRow(i)} className="col-span-1 text-[color:var(--ink-400)] hover:text-red-600 text-sm" aria-label="הסר">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-[color:var(--ink-500)]">סכום לפני מע״מ</span>
          <span>{totals.subtotal.toLocaleString('en-US')} ₪</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[color:var(--ink-500)]">מע״מ (18%)</span>
          <span>{totals.vat.toLocaleString('en-US')} ₪</span>
        </div>
        <div className="flex justify-between font-semibold text-[color:var(--ink-900)] pt-1 border-t border-[color:var(--line)]">
          <span>סה״כ</span>
          <span>{totals.total.toLocaleString('en-US')} ₪</span>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex gap-2">
        <button onClick={send} disabled={sending || !accountId || totals.total <= 0} className="ui-btn disabled:opacity-50">
          {sending ? 'שולח…' : 'שלח הצעה לחתימה'}
        </button>
      </div>
    </div>
  );
}
