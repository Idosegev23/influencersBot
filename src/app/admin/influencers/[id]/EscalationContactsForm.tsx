'use client';

/**
 * Admin-only per-account ESCALATION CONTACTS — who gets notified (email/WhatsApp)
 * when a conversation escalates. Persists to accounts.config.escalation via
 * PUT /api/admin/accounts/[accountId]/escalation. Note: the server drops rows
 * that have neither email nor WhatsApp, so the client blocks saving those.
 */

import { useEffect, useState } from 'react';

type Recipient = { name: string; email: string; whatsapp: string };

export default function EscalationContactsForm({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/accounts/${accountId}/escalation`)
      .then((r) => r.json())
      .then((d) => {
        const e = d.escalation || {};
        setEnabled(e.enabled !== false);
        setRecipients(
          (e.recipients || []).map((r: any) => ({
            name: r.name || '',
            email: r.email || '',
            whatsapp: r.whatsapp || '',
          })),
        );
      })
      .catch(() => {});
  }, [accountId]);

  function markDirty() {
    setDirty(true);
    setStatus('idle');
  }
  function update(i: number, key: keyof Recipient, val: string) {
    setRecipients((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
    markDirty();
  }
  function addRow() {
    setRecipients((rs) => [...rs, { name: '', email: '', whatsapp: '' }]);
    markDirty();
  }
  function removeRow(i: number) {
    setRecipients((rs) => rs.filter((_, idx) => idx !== i));
    markDirty();
  }

  const hasEmptyRow = recipients.some((r) => !r.email.trim() && !r.whatsapp.trim());

  async function save() {
    setStatus('saving');
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/escalation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, recipients }),
      });
      if (res.ok) {
        setStatus('saved');
        setDirty(false);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, width: '100%' };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' };

  return (
    <div dir="rtl" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>אנשי קשר לאסקלציה (תמיכה דחופה)</h3>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>אדמין בלבד</span>
      </div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px' }}>
        כשמזוהה שיחה שדורשת התערבות אנושית, ההתראה נשלחת לנמענים כאן במייל ו/או בוואטסאפ. חובה מייל או וואטסאפ בכל שורה.
      </p>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, fontSize: 13, color: '#374151' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); markDirty(); }} />
        אסקלציה פעילה לחשבון זה
      </label>

      {recipients.length === 0 && (
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px' }}>אין נמענים עדיין — הוסיפו נמען ראשון.</p>
      )}

      {recipients.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.1fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
          <div>
            {i === 0 && <label style={labelStyle}>שם</label>}
            <input placeholder="שם" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} style={inputStyle} />
          </div>
          <div>
            {i === 0 && <label style={labelStyle}>אימייל</label>}
            <input type="email" placeholder="name@example.com" value={r.email} onChange={(e) => update(i, 'email', e.target.value)} style={inputStyle} dir="ltr" />
          </div>
          <div>
            {i === 0 && <label style={labelStyle}>וואטסאפ (E.164)</label>}
            <input placeholder="+9725…" value={r.whatsapp} onChange={(e) => update(i, 'whatsapp', e.target.value)} style={inputStyle} dir="ltr" />
          </div>
          <button
            type="button"
            onClick={() => removeRow(i)}
            title="הסר נמען"
            style={{ padding: '8px 12px', borderRadius: 8, background: '#fff', color: '#dc2626', fontSize: 13, border: '1px solid #fecaca', cursor: 'pointer' }}
          >
            הסר
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={save}
          disabled={status === 'saving' || hasEmptyRow}
          title={hasEmptyRow ? 'יש שורה בלי מייל ובלי וואטסאפ — מלאו או הסירו אותה' : undefined}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#111', color: '#fff', fontSize: 13, border: 'none', opacity: status === 'saving' || hasEmptyRow ? 0.5 : 1, cursor: 'pointer' }}
        >
          {status === 'saving' ? 'שומר…' : 'שמור נמענים'}
        </button>
        <button
          type="button"
          onClick={addRow}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#111', fontSize: 13, border: '1px solid #d1d5db', cursor: 'pointer' }}
        >
          + הוסף נמען
        </button>
        {status === 'saved' && <span style={{ color: '#16a34a', fontSize: 12 }}>נשמר ✓</span>}
        {status === 'error' && <span style={{ color: '#ef4444', fontSize: 12 }}>שגיאת שמירה — נסו שוב</span>}
        {dirty && status !== 'saving' && status !== 'error' && (
          <span style={{ color: '#d97706', fontSize: 12 }}>יש שינויים שלא נשמרו</span>
        )}
        {hasEmptyRow && (
          <span style={{ color: '#d97706', fontSize: 12 }}>שורה בלי מייל/וואטסאפ לא תישמר</span>
        )}
      </div>
    </div>
  );
}
