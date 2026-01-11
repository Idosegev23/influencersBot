'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { User, Loader2, ArrowRight, Lock } from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

export default function InfluencerLoginPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        // First, check if influencer exists
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          setNotFound(true);
          setChecking(false);
          return;
        }
        setInfluencer(inf);

        // Check if already authenticated
        const res = await fetch(`/api/influencer/auth?username=${username}`);
        const data = await res.json();

        if (data.authenticated) {
          router.push(`/influencer/${username}/dashboard`);
        } else {
          setChecking(false);
        }
      } catch {
        setChecking(false);
      }
    }

    checkAuth();
  }, [username, router]);

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
        setError(data.error === 'Invalid password' ? 'סיסמה שגויה' : 'שגיאה בהתחברות');
      }
    } catch {
      setError('שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">לא נמצא</h1>
          <p className="text-gray-400 mb-6">המשפיען @{username} לא קיים במערכת</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Back button */}
      <Link
        href={`/chat/${username}`}
        className="fixed top-4 right-4 z-10 px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-800 backdrop-blur rounded-xl transition-all flex items-center gap-2"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה לצ'אט
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        {/* Profile */}
        <div className="flex flex-col items-center mb-8">
          {influencer?.avatar_url ? (
            <img
              src={influencer.avatar_url}
              alt={influencer.display_name}
              className="w-24 h-24 rounded-2xl object-cover ring-4 ring-indigo-500/20 mb-4"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center ring-4 ring-indigo-500/20 mb-4">
              <User className="w-12 h-12 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold text-white">
            {influencer?.display_name || username}
          </h1>
          <p className="text-gray-400 text-sm">@{username}</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">פאנל ניהול</h2>
            <p className="text-sm text-gray-400">הזינו את הסיסמה שלכם</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white text-center tracking-widest focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                placeholder="סיסמה"
                required
                autoFocus
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm text-center"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'כניסה'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          שכחת סיסמה?{' '}
          <Link href="/contact" className="text-indigo-400 hover:text-indigo-300">
            צרו קשר
          </Link>
        </p>
      </motion.div>
    </div>
  );
}








