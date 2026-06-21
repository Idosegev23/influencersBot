'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';

export default function AgentChangePassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/agent/onboarding/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(data.redirect || '/agent');
      } else {
        setError(data.error || 'שגיאה');
      }
    } catch {
      setError('שגיאה בשמירה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen admin-panel flex items-center justify-center p-4" dir="rtl">
      <div className="relative w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(147, 52, 235, 0.12)', border: '1px solid rgba(147, 52, 235, 0.18)' }}
          >
            <Lock className="w-10 h-10" style={{ color: '#9334EB' }} />
          </div>
        </div>

        <div className="admin-card p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold mb-1" style={{ color: '#ede9f8' }}>בחירת סיסמה</h1>
            <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.45)' }}>
              ברוך הבא! בחר סיסמה אישית להמשך
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-input"
              placeholder="סיסמה חדשה (לפחות 8 תווים)"
              autoComplete="new-password"
              required
              autoFocus
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="admin-input"
              placeholder="אימות סיסמה"
              autoComplete="new-password"
              required
            />

            {error && (
              <div className="pill pill-red px-4 py-3 text-sm text-center w-full justify-center">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn-solid w-full py-3.5 font-medium text-base disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'המשך'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
