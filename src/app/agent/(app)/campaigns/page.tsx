'use client';

import { useEffect, useState } from 'react';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [clientId, setClientId] = useState('');
  const [season, setSeason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [c, o] = await Promise.all([
      fetch('/api/agent/campaigns').then((r) => r.json()),
      fetch('/api/agent/orderers').then((r) => r.json()),
    ]);
    if (c.campaigns) setCampaigns(c.campaigns);
    if (o.clients) setClients(o.clients);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), brand_name: brand, client_id: clientId || null, season }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'שגיאה');
        return;
      }
      setName('');
      setBrand('');
      setSeason('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const inp = 'rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm';

  return (
    <div dir="rtl" className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--ink-900)]">קמפיינים</h1>
        <p className="text-sm text-[color:var(--ink-500)]">קמפיין שייך למותג וללקוח (מזמין). עסקה = מיוצג × קמפיין.</p>
      </div>

      <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4 grid gap-2 md:grid-cols-5 md:items-center">
        <input placeholder="שם הקמפיין *" value={name} onChange={(e) => setName(e.target.value)} className={inp} />
        <input placeholder="מותג" value={brand} onChange={(e) => setBrand(e.target.value)} className={inp} />
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inp}>
          <option value="">לקוח (מזמין)…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input placeholder="עונה/תקופה" value={season} onChange={(e) => setSeason(e.target.value)} className={inp} />
        <button onClick={create} disabled={saving || !name.trim()} className="ui-btn ui-btn-sm disabled:opacity-50">
          צור קמפיין
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading && <div className="text-sm text-[color:var(--ink-500)]">טוען…</div>}
      <div className="grid gap-3">
        {campaigns.map((cm) => (
          <div key={cm.id} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-0)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--ink-900)] truncate">{cm.name}</div>
                <div className="text-[13px] text-[color:var(--ink-500)] truncate">
                  {[cm.brand_name, cm.client_name, cm.season].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--ink-100)] text-[color:var(--ink-600)] shrink-0">
                {cm.status === 'active' ? 'פעיל' : 'ארכיון'}
              </span>
            </div>

            {/* The campaign's actual substance: its deals along quote → signature → active. */}
            {cm.deals > 0 ? (
              <div className="mt-3 pt-3 border-t border-[color:var(--line)]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
                  <span className="font-semibold text-[color:var(--ink-900)]" dir="ltr">
                    ₪ {Number(cm.value || 0).toLocaleString('en-US')}
                  </span>
                  <span className="text-[color:var(--ink-500)]">{cm.deals} עסקאות</span>
                  {cm.signed > 0 && (
                    <span className="text-[color:var(--success)]">✓ {cm.signed} נחתמו</span>
                  )}
                  {cm.awaiting_signature > 0 && (
                    <span className="text-[color:var(--brand)]">⏳ {cm.awaiting_signature} ממתינות לחתימה</span>
                  )}
                  {cm.draft > 0 && <span className="text-[color:var(--ink-400)]">{cm.draft} בהכנה</span>}
                </div>
                {cm.talents?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cm.talents.map((t: string) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--ink-100)] text-[color:var(--ink-600)]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-[color:var(--line)] text-[12px] text-[color:var(--ink-400)]">
                אין עדיין עסקאות בקמפיין
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
