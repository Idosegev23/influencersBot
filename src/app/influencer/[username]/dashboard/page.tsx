'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  Package,
  TrendingUp,
  Users,
  ExternalLink,
  LogOut,
  Settings,
  Copy,
  Check,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { getInfluencerByUsername, getChatSessions, getProductsByInfluencer, getAnalytics } from '@/lib/supabase';
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import type { Influencer, Product, ChatSession } from '@/types';
import NotificationBell from '@/components/NotificationBell';

export default function InfluencerDashboardPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        // Load related data
        const [prods, sess, events] = await Promise.all([
          getProductsByInfluencer(inf.id),
          getChatSessions(inf.id),
          getAnalytics(inf.id, 30),
        ]);

        setProducts(prods);
        setSessions(sess);

        // Calculate analytics
        const stats: Record<string, number> = {
          totalChats: sess.length,
          totalMessages: sess.reduce((sum, s) => sum + s.message_count, 0),
          couponCopies: events.filter((e) => e.event_type === 'coupon_copied').length,
          productClicks: events.filter((e) => e.event_type === 'product_clicked').length,
        };
        setAnalytics(stats);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const handleLogout = async () => {
    await fetch('/api/influencer/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, action: 'logout' }),
    });
    router.push(`/influencer/${username}`);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/chat/${username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  const chatLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${username}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {influencer.avatar_url ? (
                <img
                  src={influencer.avatar_url}
                  alt={influencer.display_name}
                  className="w-10 h-10 rounded-xl object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  {influencer.display_name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-white">{influencer.display_name}</h1>
                <p className="text-xs text-gray-400">@{username}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell influencerId={influencer.id} />
              <a
                href={chatLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                צפייה בבוט
              </a>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">יציאה</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Share Link */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-2xl border border-indigo-500/30"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white mb-1">הלינק לצ'אטבוט שלך</h2>
              <p className="text-sm text-gray-400">שתפו את הלינק עם העוקבים שלכם</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial px-4 py-2 bg-gray-800/50 rounded-lg text-sm text-gray-300 truncate max-w-xs">
                {chatLink}
              </div>
              <button
                onClick={handleCopyLink}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'הועתק!' : 'העתק'}
              </button>
              <Link
                href={`/influencer/${username}/share`}
                className="px-4 py-2 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-all"
              >
                QR + UTM
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNumber(analytics.totalChats || 0)}</p>
                <p className="text-sm text-gray-400">שיחות</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNumber(analytics.totalMessages || 0)}</p>
                <p className="text-sm text-gray-400">הודעות</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNumber(analytics.couponCopies || 0)}</p>
                <p className="text-sm text-gray-400">קופונים הועתקו</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNumber(analytics.productClicks || 0)}</p>
                <p className="text-sm text-gray-400">קליקים על מוצרים</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Products Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-400" />
                מוצרים וקופונים
              </h3>
              <Link
                href={`/influencer/${username}/products`}
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                ניהול מלא
              </Link>
            </div>

            {products.length > 0 ? (
              <div className="space-y-3">
                {products.slice(0, 4).map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 bg-gray-700/30 rounded-xl"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.brand}</p>
                    </div>
                    {product.coupon_code && (
                      <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-lg font-mono">
                        {product.coupon_code}
                      </span>
                    )}
                  </div>
                ))}
                {products.length > 4 && (
                  <p className="text-sm text-gray-500 text-center">+{products.length - 4} נוספים</p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-3">אין עדיין מוצרים</p>
                <Link
                  href={`/influencer/${username}/products`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  הוסף מוצר
                </Link>
              </div>
            )}
          </motion.div>

          {/* Recent Chats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-indigo-400" />
                שיחות אחרונות
              </h3>
              <span className="text-sm text-gray-500">30 ימים אחרונים</span>
            </div>

            {sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.slice(0, 5).map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 bg-gray-700/30 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                        <Users className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm text-white">{session.message_count} הודעות</p>
                        <p className="text-xs text-gray-500">{formatRelativeTime(session.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">אין עדיין שיחות</p>
                <p className="text-sm text-gray-500 mt-1">שתפו את הלינק כדי להתחיל</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          <Link
            href={`/influencer/${username}/analytics`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-2xl transition-all"
          >
            <BarChart3 className="w-8 h-8 text-indigo-400" />
            <span className="text-white font-medium">אנליטיקס</span>
          </Link>

          <Link
            href={`/influencer/${username}/conversations`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-2xl transition-all"
          >
            <MessageCircle className="w-8 h-8 text-blue-400" />
            <span className="text-white font-medium">שיחות</span>
          </Link>

          <Link
            href={`/influencer/${username}/products`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-2xl transition-all"
          >
            <Package className="w-8 h-8 text-purple-400" />
            <span className="text-white font-medium">מוצרים</span>
          </Link>

          <Link
            href={`/influencer/${username}/settings`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-2xl transition-all"
          >
            <Settings className="w-8 h-8 text-gray-400" />
            <span className="text-white font-medium">הגדרות</span>
          </Link>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-4 flex justify-center"
        >
          <a
            href={chatLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl transition-all font-medium"
          >
            <ExternalLink className="w-5 h-5" />
            צפייה בבוט
          </a>
        </motion.div>
      </main>
    </div>
  );
}

