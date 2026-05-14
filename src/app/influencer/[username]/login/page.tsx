'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { dashboardDir } from '@/lib/i18n/dashboard';

export default function InfluencerLoginPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { lang } = useDashboardLang(username);
  const isEn = lang === 'en';
  const dir = dashboardDir(lang);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const t = isEn
    ? {
        backToChat: '← Back to chat',
        title: 'Sign in to admin panel',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        signingIn: 'Signing in…',
        signIn: 'Sign in',
        contactSupport: 'Trouble signing in? Contact support.',
        defaultError: 'Sign in failed',
      }
    : {
        backToChat: "← חזרה לצ'אט",
        title: 'כניסה לפאנל ניהול',
        passwordLabel: 'סיסמה',
        passwordPlaceholder: 'הזן את הסיסמה שלך',
        signingIn: 'מתחבר...',
        signIn: 'התחבר',
        contactSupport: 'יש בעיה? צור קשר עם התמיכה',
        defaultError: 'שגיאה בהתחברות',
      };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/influencer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push(`/influencer/${username}/dashboard`);
      } else {
        setError(data.error || t.defaultError);
      }
    } catch {
      setError(t.defaultError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      dir={dir}
      style={{ background: 'var(--dash-bg)', direction: dir }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button
          onClick={() => router.push(`/chat/${username}`)}
          className="inline-flex items-center gap-2 text-sm mb-6 cursor-pointer bg-transparent border-none p-0"
          style={{ color: 'var(--dash-text-2)' }}
        >
          {t.backToChat}
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
            {t.title}
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
              {t.passwordLabel}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              disabled={loading}
              autoFocus
              dir={dir}
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
              {loading ? t.signingIn : t.signIn}
            </button>
          </form>

          <p className="text-xs text-center mt-4" style={{ color: 'var(--dash-text-3)' }}>
            {t.contactSupport}
          </p>
        </div>
      </div>
    </div>
  );
}
