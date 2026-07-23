'use client';

/**
 * Admin-only per-account STORE CONNECTION — Bestie's order/CS access channel.
 * An admin connects the account's store here; credentials persist to
 * accounts.config.integrations[platform] (the exact shape lookupOrder + the
 * QuickShop/Shopify connectors read). Tokens are write-only: the server returns
 * a masked value and a masked value is never written back, so re-saving without
 * retyping the token keeps it. "בדוק חיבור" hits the store live with the SAVED
 * credentials, so save first, then test.
 */

import { useEffect, useState } from 'react';

type Platform = 'quickshop' | 'shopify';

export default function StoreConnectionForm({ accountId }: { accountId: string }) {
  const [platform, setPlatform] = useState<Platform>('quickshop');
  const [shopDomain, setShopDomain] = useState('');
  const [token, setToken] = useState('');          // api_key (QuickShop) / admin_api_token (Shopify)
  const [webhookToken, setWebhookToken] = useState(''); // QuickShop only — path segment, not a secret
  const [enabled, setEnabled] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [test, setTest] = useState<{ running: boolean; ok?: boolean; message?: string }>({ running: false });

  useEffect(() => {
    fetch(`/api/admin/accounts/${accountId}/integrations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.integrations) setLoaded(d.integrations); })
      .catch(() => {});
  }, [accountId]);

  // Hydrate fields from the loaded config whenever the platform changes.
  useEffect(() => {
    const cfg = loaded[platform] || {};
    setShopDomain(cfg.shop_domain || '');
    setEnabled(cfg.enabled === true);
    setHasToken(!!cfg.has_token);
    setWebhookToken(cfg.webhook_token || '');
    // The token field is hydrated with the server's masked value; buildIntegrationPatch treats a
    // masked value as "unchanged" and won't overwrite the stored secret.
    setToken(platform === 'shopify' ? (cfg.admin_api_token || '') : (cfg.api_key || ''));
    setTest({ running: false });
    setStatus('idle');
  }, [platform, loaded]);

  async function save() {
    setStatus('saving');
    setTest({ running: false });
    const body: Record<string, any> =
      platform === 'shopify'
        ? { platform, shop_domain: shopDomain.trim(), api_token: token, enabled }
        : { platform, api_key: token, webhook_token: webhookToken.trim(), enabled };
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/integrations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setStatus('error'); return; }
      const d = await res.json();
      setLoaded((prev) => ({ ...prev, [platform]: d.integration }));
      setStatus('saved');
      // Connect + verify: auto-test right after a successful save.
      void runTest();
    } catch { setStatus('error'); }
  }

  async function runTest() {
    setTest({ running: true });
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const d = await res.json().catch(() => ({}));
      setTest({ running: false, ok: !!d.ok, message: d.message || (d.ok ? 'מחובר ✓' : 'נכשל') });
    } catch {
      setTest({ running: false, ok: false, message: 'בדיקה נכשלה' });
    }
  }

  const isShopify = platform === 'shopify';
  const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, width: '100%' };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block' };

  return (
    <div dir="rtl" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>חיבור חנות (ערוץ הזמנות של בסטי)</h3>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>אדמין בלבד</span>
      </div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px' }}>
        חיבור החנות מאפשר לבסטי לשלוף הזמנות + סטטוס משלוח בשירות הלקוחות. הפרטים נשמרים מוצפנים; טוקן שמור לא נדרס אם משאירים אותו.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>פלטפורמה</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} style={{ ...inputStyle, background: '#fff' }}>
            <option value="quickshop">QuickShop</option>
            <option value="shopify">Shopify</option>
          </select>
        </div>

        {isShopify && (
          <div>
            <label style={labelStyle}>דומיין החנות (myshopify)</label>
            <input value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} placeholder="xxx.myshopify.com" style={inputStyle} dir="ltr" autoComplete="off" />
          </div>
        )}

        <div style={{ gridColumn: isShopify ? 'auto' : '1 / -1' }}>
          <label style={labelStyle}>
            {isShopify ? 'Admin API access token (shpat_…)' : 'API Key של QuickShop (qs_live_…)'}
            {hasToken && <span style={{ color: '#16a34a', marginInlineStart: 6 }}>· נשמר ✓</span>}
          </label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? 'הקלד ערך חדש כדי להחליף' : (isShopify ? 'shpat_…' : 'qs_live_…')}
            style={inputStyle} dir="ltr" autoComplete="off" />
        </div>

        {!isShopify && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Webhook token (אופציונלי — מזהה החשבון בנתיב ה-webhook)</label>
            <input value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} placeholder="qscs_…" style={inputStyle} dir="ltr" autoComplete="off" />
          </div>
        )}

        <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#374151' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          חיבור פעיל
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={status === 'saving'}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#111', color: '#fff', fontSize: 13, border: 'none', opacity: status === 'saving' ? 0.5 : 1, cursor: 'pointer' }}>
          {status === 'saving' ? 'שומר…' : 'שמור חיבור'}
        </button>
        <button type="button" onClick={runTest} disabled={test.running || !hasToken}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#111', fontSize: 13, border: '1px solid #d1d5db', opacity: (test.running || !hasToken) ? 0.5 : 1, cursor: 'pointer' }}>
          {test.running ? 'בודק…' : 'בדוק חיבור'}
        </button>
        {status === 'saved' && test.ok === undefined && <span style={{ color: '#16a34a', fontSize: 12 }}>נשמר ✓</span>}
        {status === 'error' && <span style={{ color: '#ef4444', fontSize: 12 }}>שגיאת שמירה</span>}
        {test.message && (
          <span style={{ fontSize: 12, color: test.ok ? '#16a34a' : '#ef4444' }}>{test.message}</span>
        )}
      </div>
    </div>
  );
}
