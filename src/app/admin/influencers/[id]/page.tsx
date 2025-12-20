'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  User,
  Settings,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  Package,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { getInfluencerById, updateInfluencer, getProductsByInfluencer, getChatSessions } from '@/lib/supabase';
import { formatNumber, formatDateTime, hashPassword } from '@/lib/utils';
import type { Influencer, Product, ChatSession } from '@/types';

export default function AdminInfluencerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    async function checkAuthAndLoad() {
      try {
        // Check admin auth
        const authRes = await fetch('/api/admin');
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push('/admin');
          return;
        }

        // Load influencer
        const inf = await getInfluencerById(id);
        if (!inf) {
          router.push('/admin/dashboard');
          return;
        }

        setInfluencer(inf);
        setDisplayName(inf.display_name);
        setBio(inf.bio);
        setIsActive(inf.is_active);

        // Load related data
        const [prods, sess] = await Promise.all([
          getProductsByInfluencer(inf.id),
          getChatSessions(inf.id),
        ]);

        setProducts(prods);
        setSessions(sess);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndLoad();
  }, [id, router]);

  const handleSave = async () => {
    if (!influencer) return;

    setSaving(true);
    setSaved(false);

    try {
      const updates: Partial<Influencer> = {
        display_name: displayName,
        bio,
        is_active: isActive,
      };

      // If new password is set, hash it
      if (newPassword.trim()) {
        const hash = await hashPassword(newPassword);
        updates.admin_password_hash = hash;
      }

      const success = await updateInfluencer(influencer.id, updates);

      if (success) {
        setInfluencer({ ...influencer, ...updates });
        setNewPassword('');
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!influencer || deleteConfirmText !== influencer.username) return;

    try {
      const res = await fetch(`/api/admin/influencers?id=${influencer.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/admin/dashboard?deleted=true');
      }
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
              חזרה לדשבורד
            </Link>
            <div className="flex items-center gap-2">
              <a
                href={`/chat/${influencer.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                צפייה בבוט
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <div className="flex items-start gap-4">
            {influencer.avatar_url ? (
              <img
                src={influencer.avatar_url}
                alt={influencer.display_name}
                className="w-20 h-20 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{influencer.display_name}</h1>
              <p className="text-gray-400">@{influencer.username}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
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

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-700">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{products.length}</p>
              <p className="text-sm text-gray-400">מוצרים</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{sessions.length}</p>
              <p className="text-sm text-gray-400">שיחות</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">
                {sessions.reduce((sum, s) => sum + s.message_count, 0)}
              </p>
              <p className="text-sm text-gray-400">הודעות</p>
            </div>
          </div>
        </motion.div>

        {/* Edit Form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            הגדרות
          </h2>

          <div className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-2">שם תצוגה</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">ביו</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">סיסמה חדשה (למשפיען)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="השאר ריק לשמירת הסיסמה הנוכחית"
                  className="w-full px-4 py-3 pl-12 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl">
              <div>
                <p className="font-medium text-white">סטטוס פעיל</p>
                <p className="text-sm text-gray-400">כשלא פעיל, הצ'אטבוט לא יהיה נגיש</p>
              </div>
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  isActive ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    isActive ? 'right-1' : 'right-7'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full py-3 font-medium rounded-xl transition-all flex items-center justify-center gap-2 ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white'
              } disabled:opacity-50`}
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="w-5 h-5" />
                  נשמר בהצלחה!
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  שמירת שינויים
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Quick Links */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-4 mb-6"
        >
          <Link
            href={`/influencer/${influencer.username}/products`}
            className="flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-xl transition-all"
          >
            <Package className="w-6 h-6 text-indigo-400" />
            <div>
              <p className="font-medium text-white">מוצרים</p>
              <p className="text-sm text-gray-400">{products.length} מוצרים</p>
            </div>
          </Link>

          <a
            href={`/chat/${influencer.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-xl transition-all"
          >
            <MessageCircle className="w-6 h-6 text-green-400" />
            <div>
              <p className="font-medium text-white">צ'אטבוט</p>
              <p className="text-sm text-gray-400">צפייה בלייב</p>
            </div>
          </a>
        </motion.div>

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-red-950/20 border border-red-900/50 rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            אזור מסוכן
          </h2>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              מחיקת משפיען
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-400">
                פעולה זו תמחק את המשפיען, כל המוצרים, השיחות והנתונים שלו. הכתיבו{' '}
                <span className="font-mono text-white">{influencer.username}</span> לאישור:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={influencer.username}
                className="w-full px-4 py-3 bg-gray-700/50 border border-red-500/50 rounded-xl text-white focus:border-red-500 outline-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== influencer.username}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-400 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  מחיקה סופית
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

