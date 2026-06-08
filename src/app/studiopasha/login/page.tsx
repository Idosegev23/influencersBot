'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';

// Studio Pasha account. Username drives the influencer-cookie auth + dashboard
// route; the id is only used to pull branding from the public widget config so
// this page stays in sync with the account instead of hardcoding logo/colors.
// Mirrors /argania/login (single shared-password model).
const ACCOUNT_USERNAME = 'studiopasha_fashion';
const ACCOUNT_ID = '36705ad6-4f82-46af-95e1-fb5ea6f4a44f';
const SUPPORT_PATH = `/influencer/${ACCOUNT_USERNAME}/support`;
const FALLBACK_COLOR = '#1a1a1a';

export default function StudioPashaLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<{ name: string; color: string; pic: string | null }>({
    name: 'STUDIO PASHA',
    color: FALLBACK_COLOR,
    pic: null,
  });

  // Pull branding from the live account config (no hardcoded assets).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/widget/config?accountId=${ACCOUNT_ID}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data) {
          setBrand({
            name: data.brandName || 'STUDIO PASHA',
            color: data.theme?.primaryColor || FALLBACK_COLOR,
            pic: data.profilePic || null,
          });
        }
      } catch {
        // keep fallback branding
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If already logged in, skip the form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/influencer/auth?username=${ACCOUNT_USERNAME}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data.authenticated) {
          router.replace(SUPPORT_PATH);
          return;
        }
      } catch {
        // ignore — show the form
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError('יש להזין סיסמה');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/influencer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ACCOUNT_USERNAME, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError('סיסמה שגויה');
        setSubmitting(false);
        return;
      }
      router.replace(SUPPORT_PATH);
    } catch {
      setError('שגיאת רשת — נסו שוב');
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f7f7f4' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: brand.color }} />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: `linear-gradient(135deg, #f7f7f4 0%, ${brand.color}12 100%)` }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-xl"
        style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div className="text-center mb-7">
          {brand.pic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.pic}
              alt={brand.name}
              className="mx-auto w-14 h-14 rounded-full object-cover mb-4 ring-1"
              style={{ ['--tw-ring-color' as any]: brand.color + '40' }}
            />
          ) : (
            <div
              className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{ background: brand.color + '1a' }}
            >
              <LogIn className="w-6 h-6" style={{ color: brand.color }} />
            </div>
          )}
          <h1 className="text-2xl font-semibold mb-1" style={{ color: '#1a1a1a' }}>
            {brand.name}
          </h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            כניסה לניהול פניות תמיכה
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#6b7280' }}>
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full text-sm p-3 rounded-xl outline-none focus:ring-2"
              style={{
                background: '#f9fafb',
                color: '#111',
                border: '1px solid rgba(0,0,0,0.1)',
                ['--tw-ring-color' as any]: brand.color + '55',
              }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 text-sm p-3 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#b91c1c' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
            style={{ background: brand.color, color: '#fff' }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            כניסה
          </button>
        </form>
      </div>
    </div>
  );
}
