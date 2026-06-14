'use client';

/**
 * Store API connection form. Persists credentials to
 * accounts.config.integrations[platform] for future order-sync /
 * conversion-attribution use. Tokens are write-only: the server returns
 * a masked value, and an unchanged masked value is never written back.
 */

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

const PLATFORMS = [
  { value: 'quickshop', label: 'QuickShop' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'other', label: 'אחר' },
];

export default function StoreIntegrationForm({ accountId }: { accountId: string }) {
  const [platform, setPlatform] = useState('quickshop');
  const [shopDomain, setShopDomain] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch(`/api/admin/accounts/${accountId}/integrations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.integrations) setLoaded(d.integrations);
      })
      .catch(() => {});
  }, [accountId]);

  // When platform changes, hydrate fields from the loaded config for it.
  useEffect(() => {
    const cfg = loaded[platform] || {};
    setShopDomain(cfg.shop_domain || '');
    setEnabled(cfg.enabled === true);
    setHasToken(!!cfg.has_token);
    setApiToken(cfg.api_token || ''); // masked value from server
  }, [platform, loaded]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/integrations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, shop_domain: shopDomain, api_token: apiToken, enabled }),
      });
      if (res.ok) {
        const d = await res.json();
        setSaved(true);
        setLoaded((prev) => ({ ...prev, [platform]: d.integration }));
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold">חיבור API של החנות</h2>
        <span className="text-[11px] text-gray-400">לסנכרון הזמנות עתידי</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        שמירת פרטי החיבור לחנות. בשלב זה הפרטים נשמרים בלבד — סנכרון הזמנות אוטומטי יתחבר לכאן בהמשך.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">פלטפורמה</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="px-3 py-2 border rounded bg-white"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-600">דומיין החנות</span>
          <input
            type="text"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="argania-oil.co.il"
            className="px-3 py-2 border rounded"
            dir="ltr"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-gray-600">
            API Token / Key {hasToken && <span className="text-green-600">· נשמר ✓</span>}
          </span>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={hasToken ? 'הקלד ערך חדש כדי להחליף' : 'הדבק כאן את הטוקן'}
            className="px-3 py-2 border rounded"
            dir="ltr"
            autoComplete="off"
          />
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-xs text-gray-700">חיבור פעיל</span>
        </label>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
        >
          {saving ? 'שומר…' : 'שמור חיבור'}
        </button>
        {saved && <span className="text-xs text-green-600">נשמר ✓</span>}
      </div>
    </Card>
  );
}
