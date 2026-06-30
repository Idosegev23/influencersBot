'use client';

import { useEffect, useState } from 'react';

type Recipient = { name: string; email: string; whatsapp: string };

export default function EscalationContactsForm({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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

  function update(i: number, key: keyof Recipient, val: string) {
    setRecipients((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    setRecipients((rs) => [...rs, { name: '', email: '', whatsapp: '' }]);
  }
  function removeRow(i: number) {
    setRecipients((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    setStatus('saving');
    const res = await fetch(`/api/admin/accounts/${accountId}/escalation`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, recipients }),
    });
    setStatus(res.ok ? 'saved' : 'error');
  }

  return (
    <div dir="rtl" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>אנשי קשר לאסקלציה (תמיכה דחופה)</h3>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        אסקלציה פעילה לחשבון זה
      </label>

      {recipients.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="שם" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} />
          <input placeholder="אימייל" value={r.email} onChange={(e) => update(i, 'email', e.target.value)} />
          <input placeholder="וואטסאפ (E.164)" value={r.whatsapp} onChange={(e) => update(i, 'whatsapp', e.target.value)} />
          <button type="button" onClick={() => removeRow(i)}>הסר</button>
        </div>
      ))}

      <button type="button" onClick={addRow} style={{ marginInlineEnd: 8 }}>+ הוסף נמען</button>
      <button type="button" onClick={save} disabled={status === 'saving'}>
        {status === 'saving' ? 'שומר…' : 'שמור'}
      </button>
      {status === 'saved' && <span style={{ color: '#16a34a', marginInlineStart: 8 }}>נשמר ✓</span>}
      {status === 'error' && <span style={{ color: '#ef4444', marginInlineStart: 8 }}>שגיאה</span>}
    </div>
  );
}
