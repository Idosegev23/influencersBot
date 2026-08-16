'use client';

import { useCallback, useEffect, useState } from 'react';

interface Channel {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
  payment_ready: boolean;
  onboarding_mode: string;
  templates: Record<string, string> | null;
  provision_state: Record<string, boolean> | null;
  sync_initiated_at: string | null;
  connected_at: string | null;
}

const TEMPLATES = ['cs_followup', 'cs_order_update', 'cs_human_reply'];

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
      ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
      {label}
    </span>
  );
}

export default function WhatsAppChannelCard({ accountId }: { accountId: string }) {
  const [channel, setChannel] = useState<Channel | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/whatsapp-channel/${accountId}`);
      if (!res.ok) { setChannel(null); return; }
      const out = await res.json();
      setChannel(out.channel);
    } catch { setChannel(null); }
  }, [accountId]);

  useEffect(() => { void load(); }, [load]);

  const disconnect = useCallback(async () => {
    // Irreversible: the customer has to run Embedded Signup again to come back.
    if (!confirm('לנתק את מספר הוואטסאפ? הטוקן יימחק והלקוח יצטרך לחבר מחדש דרך האשף.')) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/whatsapp-channel/${accountId}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(false); }
  }, [accountId, load]);

  if (channel === undefined) return null;                       // still loading
  if (channel === null) {
    return (
      <div className="rounded-2xl border border-gray-200 p-4 mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-1">ערוץ וואטסאפ</div>
        <p className="text-xs text-gray-400">לא מחובר מספר. הלקוח מחבר דרך אשף ההצטרפות.</p>
      </div>
    );
  }

  // A 24h deadline the customer never sees — if the sync never started, Meta will offboard them.
  const syncMissing = channel.onboarding_mode === 'coexistence' && !channel.sync_initiated_at;

  return (
    <div className="rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900">ערוץ וואטסאפ</div>
        <button
          onClick={disconnect}
          disabled={busy || channel.status === 'disconnected'}
          className="text-xs font-semibold text-red-600 underline disabled:opacity-40"
        >
          {busy ? 'מנתק…' : 'נתק'}
        </button>
      </div>

      <div className="text-sm text-gray-900">
        {channel.display_phone_number || '—'}
        {channel.verified_name && <span className="text-gray-500"> · {channel.verified_name}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge ok={channel.status === 'active'} label={`סטטוס: ${channel.status}`} />
        <Badge ok={channel.payment_ready} label={channel.payment_ready ? 'תשלום פעיל' : 'אין אמצעי תשלום'} />
        <Badge ok={channel.onboarding_mode === 'coexistence'} label={channel.onboarding_mode} />
      </div>

      {syncMissing && (
        <p className="text-xs text-red-600">
          ⚠️ סנכרון Coexistence לא התחיל — למטא יש דדליין של 24 שעות מרגע החיבור, ואחריו היא מנתקת את הלקוח.
        </p>
      )}

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">תבניות</div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((name) => {
            const st = channel.templates?.[name];
            return <Badge key={name} ok={st === 'APPROVED'} label={`${name}: ${st ?? 'חסרה'}`} />;
          })}
        </div>
      </div>

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer">פרטים טכניים</summary>
        <div className="mt-2 space-y-1 font-mono">
          <div>waba_id: {channel.waba_id}</div>
          <div>phone_number_id: {channel.phone_number_id}</div>
          <div>provision: {Object.entries(channel.provision_state ?? {}).map(([k, v]) => `${k}=${v ? '✓' : '✗'}`).join(' · ') || '—'}</div>
        </div>
      </details>
    </div>
  );
}
