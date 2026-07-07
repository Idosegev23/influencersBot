'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function OrdererDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [client, setClient] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [cName, setCName] = useState('');
  const [cRole, setCRole] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/agent/orderers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.client) {
          setClient(d.client);
          setContacts(d.contacts || []);
          setCampaigns(d.campaigns || []);
        }
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [id]);

  const addContact = async () => {
    if (!cName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/orderers/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_contact', name: cName.trim(), role: cRole, email: cEmail, phone: cPhone }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'שגיאה');
        return;
      }
      setCName('');
      setCRole('');
      setCEmail('');
      setCPhone('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const inp = 'rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm';

  if (loading) return <div dir="rtl" className="text-sm text-[color:var(--ink-500)]">טוען…</div>;
  if (!client) return <div dir="rtl" className="text-sm text-red-600">לקוח לא נמצא</div>;

  return (
    <div dir="rtl" className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--ink-900)]">{client.name}</h1>
        <p className="text-sm text-[color:var(--ink-500)]">{client.type === 'agency' ? 'משרד פרסום' : 'מותג'}</p>
      </div>

      <section className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 space-y-3">
        <h3 className="text-sm font-medium text-[color:var(--ink-700)]">אנשי קשר</h3>
        {contacts.length === 0 && <p className="text-sm text-[color:var(--ink-500)]">אין אנשי קשר עדיין.</p>}
        <div className="space-y-1.5">
          {contacts.map((ct) => (
            <div key={ct.id} className="text-sm flex flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-medium text-[color:var(--ink-900)]">{ct.name}</span>
              <span className="text-[color:var(--ink-500)]">{[ct.role, ct.phone, ct.email].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-[color:var(--line)]">
          <input placeholder="שם *" value={cName} onChange={(e) => setCName(e.target.value)} className={inp} />
          <input placeholder="תפקיד" value={cRole} onChange={(e) => setCRole(e.target.value)} className={inp} />
          <input placeholder="טלפון" value={cPhone} onChange={(e) => setCPhone(e.target.value)} className={inp} dir="ltr" />
          <input placeholder="מייל" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className={inp} dir="ltr" />
        </div>
        <button onClick={addContact} disabled={saving || !cName.trim()} className="ui-btn ui-btn-sm disabled:opacity-50">
          + הוסף איש קשר
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </section>

      <section className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 space-y-2">
        <h3 className="text-sm font-medium text-[color:var(--ink-700)]">קמפיינים</h3>
        {campaigns.length === 0 && <p className="text-sm text-[color:var(--ink-500)]">אין קמפיינים ללקוח זה עדיין.</p>}
        {campaigns.map((cm) => (
          <div key={cm.id} className="text-sm text-[color:var(--ink-800)]">
            {cm.name}
            {cm.season ? ` · ${cm.season}` : ''}
          </div>
        ))}
      </section>
    </div>
  );
}
