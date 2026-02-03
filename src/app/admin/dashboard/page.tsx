'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Zap,
  Plus,
  Users,
  MessageCircle,
  ExternalLink,
  Settings,
  BarChart3,
  LogOut,
  Check,
  Trash2,
} from 'lucide-react';
import type { Influencer } from '@/types';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/image-utils';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatedNotification, setShowCreatedNotification] = useState(false);
  const createdSubdomain = searchParams.get('created');

  useEffect(() => {
    if (createdSubdomain) {
      setShowCreatedNotification(true);
      setTimeout(() => setShowCreatedNotification(false), 5000);
    }
  }, [createdSubdomain]);

  useEffect(() => {
    fetchInfluencers();
  }, []);

  const fetchInfluencers = async () => {
    try {
      const authRes = await fetch('/api/admin');
      const authData = await authRes.json();

      if (!authData.authenticated) {
        router.push('/admin');
        return;
      }

      const res = await fetch('/api/admin/influencers');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/admin');
          return;
        }
        throw new Error('Failed to fetch');
      }

      const data = await res.json();
      setInfluencers(data.influencers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.push('/admin');
  };

  const handleDelete = async (influencer: Influencer) => {
    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך למחוק את @${influencer.username}?\n\n` +
      'פעולה זו תמחק:\n' +
      '• את כל נתוני הסריקה (פוסטים, תגובות, האשטגים)\n' +
      '• את הפרסונה\n' +
      '• את כל המוצרים והקופונים\n' +
      '• את כל השיחות\n\n' +
      'המחיקה היא לצמיתות ולא ניתן לשחזר!'
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/admin/influencers?id=${influencer.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Refresh list
        await fetchInfluencers();
      } else {
        const error = await res.json();
        alert(`שגיאה במחיקה: ${error.error || 'לא ידוע'}`);
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('שגיאה במחיקה');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />

      {/* Success Notification */}
      {showCreatedNotification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl shadow-lg"
        >
          <Check className="w-5 h-5" />
          צ'אטבוט נוצר בהצלחה! - /chat/{createdSubdomain}
        </motion.div>
      )}

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-white">InfluencerBot</h1>
                <p className="text-xs text-gray-500">פאנל ניהול</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 p-6 max-w-6xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="admin-card p-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{influencers.length}</p>
                <p className="text-sm text-gray-400">משפיענים</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="admin-card p-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">
                  {influencers.filter((i) => i.is_active).length}
                </p>
                <p className="text-sm text-gray-400">פעילים</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="admin-card p-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">
                  {formatNumber(influencers.reduce((sum, i) => sum + (i.followers_count || 0), 0))}
                </p>
                <p className="text-sm text-gray-400">עוקבים כולל</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Add New Button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">משפיענים</h2>
          <Link
            href="/admin/add"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
          >
            <Plus className="w-5 h-5" />
            הוסף משפיען
          </Link>
        </div>

        {/* Influencers Grid */}
        {influencers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {influencers.map((influencer, index) => (
              <motion.div
                key={influencer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="admin-card p-4 hover:border-indigo-500/50 transition-all"
              >
                <div className="flex items-start gap-3">
                  {influencer.avatar_url ? (
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                      <Image
                        src={getProxiedImageUrl(influencer.avatar_url || '')}
                        alt={influencer.display_name}
                        fill
                        className="object-cover"
                        sizes="56px"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gray-700 flex items-center justify-center text-2xl font-bold text-gray-400 flex-shrink-0">
                      {influencer.display_name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {influencer.display_name}
                    </h3>
                    <p className="text-sm text-gray-400">@{influencer.username}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{formatNumber(influencer.followers_count)} עוקבים</span>
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          influencer.is_active
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {influencer.is_active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-700">
                  <a
                    href={`/chat/${influencer.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    צפייה
                  </a>
                  <Link
                    href={`/admin/influencers/${influencer.id}`}
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    ניהול
                  </Link>
                  <button
                    onClick={() => handleDelete(influencer)}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                    title="מחק משפיען"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="admin-card p-12 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">אין עדיין משפיענים</h3>
            <p className="text-gray-400 mb-6">התחילו על ידי הוספת המשפיען הראשון</p>
            <Link
              href="/admin/add"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              <Plus className="w-5 h-5" />
              הוסף משפיען
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

