'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          router.push('/admin/dashboard');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/admin/dashboard');
      } else {
        setError(data.error || 'סיסמה שגויה');
      }
    } catch {
      setError('שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#a094e0' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel flex items-center justify-center p-4" dir="rtl">
      {/* Back button */}
      <Link
        href="/"
        className="fixed top-4 right-4 z-10 btn-ghost text-sm"
      >
        חזרה
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(160, 148, 224, 0.12)', border: '1px solid rgba(160, 148, 224, 0.18)', boxShadow: '0 0 40px rgba(160, 148, 224, 0.1)' }}>
            <Zap className="w-10 h-10" style={{ color: '#a094e0' }} />
          </div>
        </div>

        {/* Card */}
        <div className="admin-card p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold mb-1" style={{ color: '#ede9f8' }}>פאנל ניהול</h1>
            <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>InfluencerBot</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="admin-input text-center text-lg tracking-widest"
                placeholder="סיסמה"
                required
                autoFocus
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pill pill-red px-4 py-3 text-sm text-center w-full justify-center"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-solid w-full py-3.5 font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'כניסה'
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
