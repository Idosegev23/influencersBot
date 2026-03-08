'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';

export default function InfluencerLoginPage({
  params
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('[Login] Attempting login for:', username);

      const res = await fetch('/api/influencer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password
        }),
      });

      const data = await res.json();
      console.log('[Login] Response status:', res.status);
      console.log('[Login] Response data:', data);

      if (res.ok) {
        console.log('[Login] Success! Redirecting to dashboard');
        router.push(`/influencer/${username}/dashboard`);
      } else {
        console.error('[Login] Failed:', data.error);
        setError(data.error || 'שגיאה בהתחברות');
      }
    } catch (err) {
      console.error('[Login] Exception:', err);
      setError('שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      dir="rtl"
      style={{ background: 'var(--dash-bg)' }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button
          onClick={() => router.push(`/chat/${username}`)}
          className="inline-flex items-center gap-2 text-sm mb-6 cursor-pointer bg-transparent border-none p-0"
          style={{ color: 'var(--dash-text-2)' }}
        >
          ← חזרה לצ'אט
        </button>

        <div
          className="w-full rounded-2xl p-8"
          style={{
            background: 'var(--dash-surface)',
            border: '1px solid var(--dash-border)',
          }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-4"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            {username.charAt(0).toUpperCase()}
          </div>

          <h1 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--dash-text)' }}>
            כניסה לפאנל ניהול
          </h1>
          <p className="text-sm text-center mb-6" style={{ color: 'var(--dash-text-2)' }}>
            @{username}
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div
                className="p-3 rounded-lg text-sm mb-4"
                style={{
                  background: 'color-mix(in srgb, var(--dash-negative) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--dash-negative) 30%, transparent)',
                  color: 'var(--dash-negative)',
                }}
              >
                {error}
              </div>
            )}

            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="הזן את הסיסמה שלך"
              disabled={loading}
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2"
              style={{
                background: 'var(--dash-bg)',
                border: '1px solid var(--dash-border)',
                color: 'var(--dash-text)',
                fontFamily: 'inherit',
              }}
            />

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl text-base font-semibold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{
                background: 'var(--color-primary)',
                color: 'white',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>

          <p className="text-xs text-center mt-4" style={{ color: 'var(--dash-text-3)' }}>
            יש בעיה? צור קשר עם התמיכה
          </p>
        </div>
      </div>
    </div>
  );
}
