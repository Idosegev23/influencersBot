'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  TrendingUp,
  Users,
  ExternalLink,
  LogOut,
  Settings,
  Copy,
  Check,
  BarChart3,
  Loader2,
  FileText,
  Headphones,
  RefreshCw,
  Tag,
  Briefcase,
  CheckCircle2,
  Calendar,
  FileCheck,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { getInfluencerByUsername, getChatSessions, getAnalytics, type Partnership } from '@/lib/supabase';
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import type { Influencer, ChatSession } from '@/types';
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
  const [brandsLegacy, setBrandsLegacy] = useState<Partnership[]>([]); // Renamed from brands
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});
  const [audienceAnalytics, setAudienceAnalytics] = useState<any>(null);
  const [taskSummary, setTaskSummary] = useState<any>(null);
  const [partnerships, setPartnerships] = useState<any[]>([]);
  const [partnershipCoupons, setPartnershipCoupons] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ products: number; content: number } | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

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
        const [sess, events] = await Promise.all([
          getChatSessions(inf.id),
          getAnalytics(inf.id, 30),
        ]);

        // Load partnerships via API (handles auth correctly)
        try {
          const partnershipsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
          if (partnershipsRes.ok) {
            const partnershipsData = await partnershipsRes.json();
            const loadedPartnerships = partnershipsData.partnerships || [];
            setBrandsLegacy(loadedPartnerships);
            
            // Load coupons for each partnership
            const couponsMap: Record<string, any[]> = {};
            await Promise.all(
              loadedPartnerships.map(async (p: any) => {
                try {
                  const couponsRes = await fetch(
                    `/api/influencer/partnerships/${p.id}/coupons?username=${username}`
                  );
                  if (couponsRes.ok) {
                    const couponsData = await couponsRes.json();
                    couponsMap[p.id] = couponsData.coupons || [];
                  }
                } catch (err) {
                  console.error('Error loading coupons for partnership:', p.id, err);
                  couponsMap[p.id] = [];
                }
              })
            );
            setPartnershipCoupons(couponsMap);
          }
        } catch (err) {
          console.error('Error loading partnerships:', err);
          setBrandsLegacy([]);
        }

        setSessions(sess);

        // Calculate analytics
        const stats: Record<string, number> = {
          totalChats: sess.length,
          totalMessages: sess.reduce((sum, s) => sum + s.message_count, 0),
          couponCopies: events.filter((e) => e.event_type === 'coupon_copied').length,
          productClicks: events.filter((e) => e.event_type === 'product_clicked').length,
        };
        setAnalytics(stats);

        // Load new Influencer OS data
        try {
          // Load audience analytics
          const audienceRes = await fetch(`/api/influencer/analytics/audience?username=${username}`);
          if (audienceRes.ok) {
            const audienceData = await audienceRes.json();
            setAudienceAnalytics(audienceData);
          }

          // Load task summary
          const tasksRes = await fetch(`/api/influencer/tasks/summary?username=${username}&days=7`);
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            setTaskSummary(tasksData);
          }

          // Load partnerships
          const partnershipsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=5`);
          if (partnershipsRes.ok) {
            const partnershipsData = await partnershipsRes.json();
            setPartnerships(partnershipsData.partnerships || []);
          }
        } catch (err) {
          console.error('Error loading new data:', err);
        }
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

  const handleRescan = async () => {
    if (!influencer) return;

    setRescanning(true);
    setRescanResult(null);
    try {
      const response = await fetch('/api/influencer/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (response.ok) {
        const data = await response.json();
        setRescanResult({
          products: data.productsCount || 0,
          content: data.contentCount || 0,
        });
        // Reload partnerships after rescan
        if (influencer) {
          try {
            const partnershipsRes = await fetch(`/api/influencer/partnerships?username=${username}&limit=100`);
            if (partnershipsRes.ok) {
              const partnershipsData = await partnershipsRes.json();
              setBrandsLegacy(partnershipsData.partnerships || []);
            }
          } catch (err) {
            console.error('Error reloading partnerships:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error rescanning:', error);
    } finally {
      setRescanning(false);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/chat/${username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true);
    try {
      const response = await fetch(`/api/integrations/google-calendar/connect?username=${username}`);
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting calendar:', error);
      alert('שגיאה בחיבור ליומן. נסה שוב.');
    } finally {
      setConnectingCalendar(false);
    }
  };

  useEffect(() => {
    // Check if calendar is connected
    const checkCalendarStatus = async () => {
      try {
        const response = await fetch(`/api/integrations/google-calendar/status?username=${username}`);
        if (response.ok) {
          const data = await response.json();
          setCalendarConnected(data.connected);
        }
      } catch (error) {
        console.error('Error checking calendar status:', error);
      }
    };
    
    if (influencer) {
      checkCalendarStatus();
    }
  }, [influencer, username]);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
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
              <NotificationBell username={username} accountId={influencer.id} />
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

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
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

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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
                <p className="text-2xl font-bold text-white">{formatNumber(audienceAnalytics?.overview?.totalConversations || analytics.totalChats || 0)}</p>
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
                <Tag className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNumber(audienceAnalytics?.overview?.couponCopiedCount || analytics.couponCopies || 0)}</p>
                <p className="text-sm text-gray-400">קופונים</p>
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
                <Briefcase className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{partnerships.length || 0}</p>
                <p className="text-sm text-gray-400">שת"פים</p>
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
                <CheckCircle2 className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{taskSummary?.summary?.statusCounts?.pending || 0}</p>
                <p className="text-sm text-gray-400">משימות</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{audienceAnalytics?.overview?.conversionRate?.toFixed(1) || '0.0'}%</p>
                <p className="text-sm text-gray-400">המרה</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Upcoming Tasks */}
          {taskSummary && (taskSummary.upcoming?.length > 0 || taskSummary.overdue?.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  משימות קרובות
                </h3>
                <Link
                  href={`/influencer/${username}/tasks`}
                  className="text-sm text-orange-400 hover:text-orange-300"
                >
                  כל המשימות
                </Link>
              </div>

              <div className="space-y-3">
                {taskSummary.overdue?.slice(0, 2).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl"
                  >
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{task.title}</p>
                      <p className="text-xs text-red-400">באיחור - {new Date(task.due_date).toLocaleDateString('he-IL')}</p>
                      {task.partnership && (
                        <p className="text-xs text-gray-400">{task.partnership.brand_name}</p>
                      )}
                    </div>
                  </div>
                ))}

                {taskSummary.upcoming?.slice(0, 3).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 bg-gray-700/30 rounded-xl"
                  >
                    <CheckCircle2 className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{task.title}</p>
                      <p className="text-xs text-gray-400">{new Date(task.due_date).toLocaleDateString('he-IL')}</p>
                      {task.partnership_name && (
                        <p className="text-xs text-gray-500">{task.partnership_name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Active Partnerships */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-purple-400" />
                שת"פים פעילים
              </h3>
              <Link
                href={`/influencer/${username}/partnerships`}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                ניהול מלא
              </Link>
            </div>

            {partnerships.length > 0 ? (
              <div className="space-y-3">
                {partnerships.slice(0, 4).map((partnership) => (
                  <Link
                    key={partnership.id}
                    href={`/influencer/${username}/partnerships/${partnership.id}`}
                    className="flex items-center justify-between p-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{partnership.brand_name}</p>
                      <p className="text-xs text-gray-400">
                        {partnership.status === 'active' && '✓ פעיל'}
                        {partnership.status === 'proposal' && '📋 הצעה'}
                        {partnership.status === 'contract' && '📝 חוזה'}
                        {partnership.status === 'negotiation' && '💬 משא ומתן'}
                      </p>
                    </div>
                    {partnership.contract_amount && (
                      <span className="text-sm font-bold text-green-400">
                        ₪{formatNumber(partnership.contract_amount)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-3">אין עדיין שת"פים</p>
                <Link
                  href={`/influencer/${username}/partnerships`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors"
                >
                  הוסף שת"פ
                </Link>
              </div>
            )}
          </motion.div>

          {/* Brands/Coupons Section (from partnerships) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-pink-400" />
                מותגים וקופונים
              </h3>
              <Link
                href={`/influencer/${username}/partnerships`}
                className="text-sm text-pink-400 hover:text-pink-300"
              >
                ניהול מלא
              </Link>
            </div>

            {brandsLegacy.length > 0 ? (
              <div className="space-y-3">
                {brandsLegacy.slice(0, 4).map((partnership) => (
                  <Link
                    key={partnership.id}
                    href={`/influencer/${username}/partnerships/${partnership.id}`}
                    className="flex items-center justify-between p-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-xl transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{partnership.brand_name}</p>
                      {partnership.category && <p className="text-xs text-gray-400">{partnership.category}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {partnershipCoupons[partnership.id]?.length > 0 ? (
                        <>
                          <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-lg font-mono">
                            {partnershipCoupons[partnership.id][0].code}
                          </span>
                          {partnershipCoupons[partnership.id].length > 1 && (
                            <span className="text-xs text-gray-400">
                              +{partnershipCoupons[partnership.id].length - 1}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">ללא קופונים</span>
                      )}
                    </div>
                  </Link>
                ))}
                {brandsLegacy.length > 4 && (
                  <p className="text-sm text-gray-500 text-center">+{brandsLegacy.length - 4} נוספים</p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Tag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-3">אין עדיין מותגים</p>
                <Link
                  href={`/influencer/${username}/partnerships`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white text-sm rounded-lg hover:bg-pink-500 transition-colors"
                >
                  הוסף שת"פ
                </Link>
              </div>
            )}
          </motion.div>

          {/* Recent Chats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-indigo-400" />
                שיחות אחרונות
              </h3>
              <Link
                href={`/influencer/${username}/conversations`}
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                כל השיחות
              </Link>
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
          transition={{ delay: 0.55 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          <Link
            href={`/influencer/${username}/partnerships`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-500/50 rounded-2xl transition-all"
          >
            <Briefcase className="w-8 h-8 text-purple-400" />
            <span className="text-white font-medium">שת"פים</span>
          </Link>

          <Link
            href={`/influencer/${username}/tasks`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-orange-500/50 rounded-2xl transition-all"
          >
            <CheckCircle2 className="w-8 h-8 text-orange-400" />
            <span className="text-white font-medium">משימות</span>
          </Link>

          <Link
            href={`/influencer/${username}/analytics`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-2xl transition-all"
          >
            <BarChart3 className="w-8 h-8 text-indigo-400" />
            <span className="text-white font-medium">אנליטיקס</span>
          </Link>

          <Link
            href={`/influencer/${username}/partnerships`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-pink-500/50 rounded-2xl transition-all"
          >
            <Tag className="w-8 h-8 text-pink-400" />
            <span className="text-white font-medium">מותגים וקופונים</span>
          </Link>

          <Link
            href={`/influencer/${username}/conversations`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-blue-500/50 rounded-2xl transition-all"
          >
            <MessageCircle className="w-8 h-8 text-blue-400" />
            <span className="text-white font-medium">שיחות</span>
          </Link>

          <Link
            href={`/influencer/${username}/content`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-500/50 rounded-2xl transition-all"
          >
            <FileText className="w-8 h-8 text-orange-400" />
            <span className="text-white font-medium">תוכן</span>
          </Link>

          <Link
            href={`/influencer/${username}/support`}
            className="flex flex-col items-center gap-3 p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-green-500/50 rounded-2xl transition-all"
          >
            <Headphones className="w-8 h-8 text-green-400" />
            <span className="text-white font-medium">תמיכה</span>
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
          transition={{ delay: 0.6 }}
          className="mt-8 flex flex-col items-center gap-4"
        >
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={chatLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl transition-all font-medium"
            >
              <ExternalLink className="w-5 h-5" />
              צפייה בבוט
            </a>
            
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl transition-all font-medium"
            >
              {rescanning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  סורק מחדש...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  סרוק מחדש מאינסטגרם
                </>
              )}
            </button>

            <button
              onClick={handleConnectCalendar}
              disabled={connectingCalendar || calendarConnected}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-medium ${
                calendarConnected
                  ? 'bg-green-600/20 border border-green-500/30 text-green-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
              } disabled:opacity-50`}
            >
              {connectingCalendar ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  מתחבר...
                </>
              ) : calendarConnected ? (
                <>
                  <Check className="w-5 h-5" />
                  יומן מחובר
                </>
              ) : (
                <>
                  <Calendar className="w-5 h-5" />
                  חבר יומן גוגל
                </>
              )}
            </button>
          </div>
          
          {rescanResult && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-xl"
            >
              <p className="text-sm text-green-300">
                נמצאו {rescanResult.products} מוצרים ו-{rescanResult.content} פריטי תוכן 🎉
              </p>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
