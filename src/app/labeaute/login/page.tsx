'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';

const ACCOUNT_USERNAME = 'labeaute.israel';
const SUPPORT_PATH = `/influencer/${ACCOUNT_USERNAME}/support`;

export default function LabeauteLoginPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, skip the form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agent/me?accountUsername=${ACCOUNT_USERNAME}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data.authenticated) {
          router.replace(SUPPORT_PATH);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !password) {
      setError('יש למלא את כל השדות');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/agent/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountUsername: ACCOUNT_USERNAME,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError('שם או סיסמה שגויים');
        setSubmitting(false);
        return;
      }
      router.replace(SUPPORT_PATH);
    } catch {
      setError('שגיאת רשת — נסי שוב');
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0b0b0f' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#883fe2' }} />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0b0b0f 0%, #1a0f2a 100%)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
        style={{
          background: 'rgba(20, 20, 28, 0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="text-center mb-7">
          <div
            className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(136,63,226,0.15)' }}
          >
            <LogIn className="w-6 h-6" style={{ color: '#883fe2' }} />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-1">LA BEAUTÉ</h1>
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            כניסה למערכת הניהול
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#9ca3af' }}>
              שם פרטי
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              autoComplete="given-name"
              className="w-full text-sm p-3 rounded-xl outline-none focus:ring-2"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#9ca3af' }}>
              שם משפחה
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              className="w-full text-sm p-3 rounded-xl outline-none focus:ring-2"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#9ca3af' }}>
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full text-sm p-3 rounded-xl outline-none focus:ring-2"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 text-sm p-3 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            style={{ background: '#883fe2', color: '#fff' }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            כניסה
          </button>
        </form>
      </div>
    </div>
  );
}
