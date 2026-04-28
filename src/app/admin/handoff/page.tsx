'use client';

import { useEffect, useState } from 'react';

/**
 * /admin/handoff?token=...
 *
 * Lightweight toggle that flips
 * accounts.config.features.handoff_button_enabled on the LDRS account.
 * Bookmark the URL with the token; clicking ON/OFF takes effect within
 * seconds — no deploy required.
 */
export default function HandoffAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick the token from the URL on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URL(window.location.href).searchParams.get('token');
    setToken(t);
    if (!t) {
      setError('Missing ?token=… in URL');
      setLoading(false);
      return;
    }
    void load(t);
  }, []);

  async function load(t: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/handoff?token=${encodeURIComponent(t)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEnabled(!!data.enabled);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function flip(next: boolean) {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/handoff?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEnabled(!!data.enabled);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg,#0c1013 0%,#1a2030 70%,#243454 100%)',
        padding: 24,
        direction: 'rtl',
        fontFamily: 'Heebo, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: '#ffffff',
          borderRadius: 24,
          padding: 32,
          boxShadow: '0 20px 60px -10px rgba(12,16,19,0.4)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: '#5FD4F5',
            marginBottom: 8,
          }}
        >
          LEADERS · ADMIN
        </div>
        <h1 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: '#0c1013' }}>
          כפתור "שלח לאיתמר אישית"
        </h1>
        <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#676767', lineHeight: 1.6 }}>
          מתג למבקרי הכנס ב-/chat/ldrs_group?source=conf. ההפעלה ניכרת תוך שניות בלי deploy.
        </p>

        {loading ? (
          <div style={{ color: '#9aa3b0', fontSize: 14 }}>טוען…</div>
        ) : error ? (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        ) : (
          <div
            style={{
              padding: '20px 24px',
              borderRadius: 16,
              background: enabled ? '#ecfdf5' : '#fafafa',
              border: enabled ? '1px solid #a7f3d0' : '1px solid #e4e4e7',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: enabled ? '#047857' : '#71717a',
                  marginBottom: 4,
                }}
              >
                סטטוס נוכחי
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: enabled ? '#047857' : '#52525b',
                }}
              >
                {enabled ? 'פעיל ✓' : 'כבוי'}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => flip(true)}
              disabled={saving || enabled === true}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 14,
                border: 'none',
                fontSize: 15,
                fontWeight: 700,
                cursor: saving || enabled === true ? 'default' : 'pointer',
                background:
                  enabled === true
                    ? '#e4e4e7'
                    : 'linear-gradient(135deg,#10b981 0%,#047857 100%)',
                color: enabled === true ? '#71717a' : '#ffffff',
                boxShadow: enabled === true ? 'none' : '0 4px 12px rgba(16,185,129,0.25)',
                transition: 'all 0.2s',
                opacity: saving ? 0.6 : 1,
              }}
            >
              הפעל
            </button>
            <button
              onClick={() => flip(false)}
              disabled={saving || enabled === false}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 14,
                border: 'none',
                fontSize: 15,
                fontWeight: 700,
                cursor: saving || enabled === false ? 'default' : 'pointer',
                background:
                  enabled === false
                    ? '#e4e4e7'
                    : 'linear-gradient(135deg,#0c1013 0%,#1a2030 100%)',
                color: enabled === false ? '#71717a' : '#ffffff',
                boxShadow: enabled === false ? 'none' : '0 4px 12px rgba(12,16,19,0.25)',
                transition: 'all 0.2s',
                opacity: saving ? 0.6 : 1,
              }}
            >
              כבה
            </button>
          </div>
        )}

        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid #f4f4f5',
            fontSize: 11,
            color: '#9aa3b0',
            lineHeight: 1.6,
          }}
        >
          הפעולה משנה <code style={{ background: '#fafafa', padding: '2px 6px', borderRadius: 4 }}>accounts.config.features.handoff_button_enabled</code> ב-Supabase. אין צורך ב-deploy.
        </div>
      </div>
    </div>
  );
}
