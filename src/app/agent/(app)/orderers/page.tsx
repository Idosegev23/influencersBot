'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Client = { id: string; name: string; type: string; contacts: number; campaigns: number };

export default function OrderersPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('brand');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch('/api/agent/orderers')
      .then((r) => r.json())
      .then((d) => {
        if (d.clients) setClients(d.clients);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/orderers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'שגיאה');
        return;
      }
      setName('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const inp = 'rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm';

  return (
    <div dir="rtl" className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--ink-900)]">לקוחות</h1>
        <p className="text-sm text-[color:var(--ink-500)]">המזמינים — מותגים ומשרדי פרסום. למשרד פרסום אפשר להוסיף אנשי קשר.</p>
      </div>

      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 flex flex-wrap gap-2 items-center">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הלקוח" className={`${inp} flex-1 min-w-[180px]`} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={inp}>
          <option value="brand">מותג</option>
          <option value="agency">משרד פרסום</option>
        </select>
        <button onClick={create} disabled={saving || !name.trim()} className="ui-btn ui-btn-sm disabled:opacity-50">
          הוסף לקוח
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading && <div className="text-sm text-[color:var(--ink-500)]">טוען…</div>}
      <div className="grid gap-3">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/agent/orderers/${c.id}`}
            className="block rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 hover:border-[color:var(--brand)] transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--ink-900)] truncate">{c.name}</div>
                <div className="text-[13px] text-[color:var(--ink-500)]">{c.type === 'agency' ? 'משרד פרסום' : 'מותג'}</div>
              </div>
              <div className="text-[12px] text-[color:var(--ink-500)] shrink-0">
                {c.campaigns} קמפיינים · {c.contacts} אנשי קשר
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
