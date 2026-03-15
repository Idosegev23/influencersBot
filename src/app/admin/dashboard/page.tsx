'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
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
  Globe,
  FileText,
  Building2,
  ClipboardCheck,
  Copy,
  Image as LucideImage,
} from 'lucide-react';
import type { Influencer } from '@/types';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/image-utils';

type ActiveTab = 'social' | 'websites';
type AccountFilter = 'all' | 'creator' | 'brand';

interface WebsiteAccount {
  id: string;
  domain: string;
  displayName: string;
  url: string;
  pagesCount: number;
  chunksCount: number;
  primaryColor: string;
  profilePic: string | null;
  managementToken: string | null;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatedNotification, setShowCreatedNotification] = useState(false);
  const createdSubdomain = searchParams.get('created');

  // Tab & filter state
  const [activeTab, setActiveTab] = useState<ActiveTab>('social');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');

  // Websites state
  const [websites, setWebsites] = useState<WebsiteAccount[]>([]);
  const [websitesLoading, setWebsitesLoading] = useState(false);
  const [websitesFetched, setWebsitesFetched] = useState(false);
  const [copiedManageId, setCopiedManageId] = useState<string | null>(null);
  const [generatingTokenId, setGeneratingTokenId] = useState<string | null>(null);

  useEffect(() => {
    if (createdSubdomain) {
      setShowCreatedNotification(true);
      setTimeout(() => setShowCreatedNotification(false), 5000);
    }
  }, [createdSubdomain]);

  useEffect(() => {
    fetchInfluencers();
  }, []);

  // Fetch websites when tab first activated
  const fetchWebsites = useCallback(async () => {
    if (websitesFetched) return;
    setWebsitesLoading(true);
    try {
      const res = await fetch('/api/admin/websites');
      if (res.ok) {
        const data = await res.json();
        setWebsites(data.websites || []);
      }
    } catch (err) {
      console.error('Error fetching websites:', err);
    } finally {
      setWebsitesLoading(false);
      setWebsitesFetched(true);
    }
  }, [websitesFetched]);

  useEffect(() => {
    if (activeTab === 'websites') {
      fetchWebsites();
    }
  }, [activeTab, fetchWebsites]);

  const fetchInfluencers = async () => {
    try {
      const authRes = await fetch('/api/admin');
      const authData = await authRes.json();

      if (!authData.authenticated) {
        router.push('/admin');
        return;
      }

      const res = await fetch('/api/admin/accounts');
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
      const res = await fetch(`/api/admin/accounts/${influencer.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
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

  // Filtered influencers based on account type
  const filteredInfluencers = influencers.filter((i) => {
    if (accountFilter === 'all') return true;
    return i.type === accountFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      {/* Success Notification */}
      {showCreatedNotification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pill pill-green px-5 py-3 text-sm font-medium shadow-lg"
        >
          <Check className="w-4 h-4" />
          צ&apos;אטבוט נוצר בהצלחה! - /chat/{createdSubdomain}
        </motion.div>
      )}

      {/* Header */}
      <header className="relative z-10 sticky top-0" style={{ background: 'rgba(7, 7, 13, 0.88)', backdropFilter: 'blur(20px) saturate(1.4)', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)' }}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(160, 148, 224, 0.12)', border: '1px solid rgba(160, 148, 224, 0.18)' }}>
                <Zap className="w-5 h-5" style={{ color: '#a094e0' }} />
              </div>
              <div>
                <h1 className="font-semibold" style={{ color: '#ede9f8' }}>InfluencerBot</h1>
                <p className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>פאנל ניהול</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 p-6 max-w-6xl mx-auto">
        {/* Tab Bar */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('social')}
            className={`pill flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'social'
                ? 'pill-purple'
                : ''
            }`}
            style={activeTab === 'social' ? { background: 'rgba(160, 148, 224, 0.15)', borderColor: 'rgba(160, 148, 224, 0.25)', color: '#a094e0' } : {}}
          >
            <Users className="w-4 h-4" />
            חשבונות סושיאל
          </button>
          <button
            onClick={() => setActiveTab('websites')}
            className={`pill flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'websites'
                ? 'pill-teal'
                : ''
            }`}
            style={activeTab === 'websites' ? { background: 'rgba(94, 234, 212, 0.12)', borderColor: 'rgba(94, 234, 212, 0.2)', color: '#5eead4' } : {}}
          >
            <Globe className="w-4 h-4" />
            אתרים
          </button>

          <div className="w-px h-6 mx-1" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />

          <Link
            href="/admin/onboarding"
            className="pill flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all hover:border-[rgba(160,148,224,0.15)]"
          >
            <ClipboardCheck className="w-4 h-4" />
            אונבורדינג
          </Link>

          <Link
            href="/admin/brand-logos"
            className="pill flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all hover:border-[rgba(160,148,224,0.15)]"
          >
            <LucideImage className="w-4 h-4" />
            לוגואים
          </Link>
        </div>

        {/* ===== Social Tab ===== */}
        {activeTab === 'social' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="admin-card p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(160, 148, 224, 0.1)', border: '1px solid rgba(160, 148, 224, 0.12)' }}>
                    <Users className="w-6 h-6" style={{ color: '#a094e0' }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold" style={{ color: '#ede9f8' }}>{filteredInfluencers.length}</p>
                    <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>חשבונות</p>
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
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(94, 234, 212, 0.1)', border: '1px solid rgba(94, 234, 212, 0.12)' }}>
                    <MessageCircle className="w-6 h-6" style={{ color: '#5eead4' }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold" style={{ color: '#ede9f8' }}>
                      {filteredInfluencers.filter((i) => i.is_active).length}
                    </p>
                    <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>פעילים</p>
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
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(224, 164, 148, 0.1)', border: '1px solid rgba(224, 164, 148, 0.12)' }}>
                    <BarChart3 className="w-6 h-6" style={{ color: '#e0a494' }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold" style={{ color: '#ede9f8' }}>
                      {formatNumber(filteredInfluencers.reduce((sum, i) => sum + (i.followers_count || 0), 0))}
                    </p>
                    <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>עוקבים כולל</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Action bar with sub-filter */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold" style={{ color: '#ede9f8' }}>חשבונות</h2>
                {/* Sub-filter pills */}
                <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  {([
                    { key: 'all' as AccountFilter, label: 'הכל' },
                    { key: 'creator' as AccountFilter, label: 'משפיענים' },
                    { key: 'brand' as AccountFilter, label: 'מותגים' },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setAccountFilter(key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                        accountFilter === key
                          ? ''
                          : ''
                      }`}
                      style={accountFilter === key
                        ? { background: 'rgba(160, 148, 224, 0.12)', color: '#a094e0', border: '1px solid rgba(160, 148, 224, 0.15)' }
                        : { color: 'rgba(237, 233, 248, 0.35)', border: '1px solid transparent' }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/admin/influencers"
                  className="btn-ghost flex items-center gap-2 text-sm"
                >
                  <Users className="w-4 h-4" />
                  תצוגה מפורטת
                </Link>
                <Link
                  href="/admin/add"
                  className="btn-primary flex items-center gap-2 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  הוסף חשבון
                </Link>
              </div>
            </div>

            {/* Influencers Grid */}
            {filteredInfluencers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredInfluencers.map((influencer, index) => (
                  <motion.div
                    key={influencer.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="admin-card p-4 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {influencer.profile_pic_url ? (
                        <div className="relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0" style={{ border: '2px solid rgba(160, 148, 224, 0.15)' }}>
                          <Image
                            src={getProxiedImageUrl(influencer.profile_pic_url || '')}
                            alt={influencer.display_name}
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '2px solid rgba(255, 255, 255, 0.06)', color: 'rgba(237, 233, 248, 0.3)' }}>
                          ?
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate" style={{ color: '#ede9f8' }}>
                          {influencer.display_name}
                        </h3>
                        <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>@{influencer.username}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>{formatNumber(influencer.followers_count)} עוקבים</span>
                          <span
                            className={`pill text-[11px] py-0.5 px-2 ${
                              influencer.is_active
                                ? 'pill-green'
                                : 'pill-neutral'
                            }`}
                          >
                            {influencer.is_active ? 'פעיל' : 'לא פעיל'}
                          </span>
                          {influencer.type === 'brand' && (
                            <span className="pill pill-blue text-[11px] py-0.5 px-2">
                              מותג
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <a
                        href={`/chat/${influencer.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        צפייה
                      </a>
                      <Link
                        href={`/admin/influencers/${influencer.id}`}
                        className="btn-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        ניהול
                      </Link>
                      <button
                        onClick={() => handleDelete(influencer)}
                        className="flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-full transition-all"
                        style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.12)' }}
                        title="מחק"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <Users className="w-8 h-8" style={{ color: 'rgba(237, 233, 248, 0.2)' }} />
                </div>
                <h3 className="text-lg font-medium mb-2" style={{ color: '#ede9f8' }}>
                  {accountFilter === 'all' ? 'אין עדיין חשבונות' : accountFilter === 'creator' ? 'אין משפיענים' : 'אין מותגים'}
                </h3>
                <p className="mb-6" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                  {accountFilter === 'all' ? 'התחילו על ידי הוספת חשבון ראשון' : 'לא נמצאו חשבונות מסוג זה'}
                </p>
                <Link
                  href="/admin/add"
                  className="btn-primary inline-flex items-center gap-2 px-6 py-3 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  הוסף חשבון
                </Link>
              </motion.div>
            )}
          </>
        )}

        {/* ===== Websites Tab ===== */}
        {activeTab === 'websites' && (
          <>
            {websitesLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-[#5eead4] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Website Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="admin-card p-6"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(94, 234, 212, 0.1)', border: '1px solid rgba(94, 234, 212, 0.12)' }}>
                        <Globe className="w-6 h-6" style={{ color: '#5eead4' }} />
                      </div>
                      <div>
                        <p className="text-3xl font-bold" style={{ color: '#ede9f8' }}>{websites.length}</p>
                        <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>אתרים</p>
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
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(160, 148, 224, 0.1)', border: '1px solid rgba(160, 148, 224, 0.12)' }}>
                        <FileText className="w-6 h-6" style={{ color: '#a094e0' }} />
                      </div>
                      <div>
                        <p className="text-3xl font-bold" style={{ color: '#ede9f8' }}>
                          {websites.reduce((sum, w) => sum + w.pagesCount, 0)}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>מסמכים</p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Action bar */}
                <div className="mb-6">
                  <h2 className="text-xl font-semibold" style={{ color: '#ede9f8' }}>אתרים</h2>
                </div>

                {/* Websites Grid */}
                {websites.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {websites.map((website, index) => (
                      <motion.div
                        key={website.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="admin-card p-4 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          {website.profilePic ? (
                            <div className="relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0" style={{ border: '2px solid rgba(255, 255, 255, 0.06)' }}>
                              <Image
                                src={website.profilePic}
                                alt={website.displayName}
                                fill
                                className="object-cover"
                                sizes="56px"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div
                              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: website.primaryColor + '15', border: `2px solid ${website.primaryColor}20` }}
                            >
                              <Globe className="w-7 h-7" style={{ color: website.primaryColor }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate" style={{ color: '#ede9f8' }}>
                              {website.displayName}
                            </h3>
                            <a
                              href={website.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm truncate block transition-colors"
                              style={{ color: '#5eead4' }}
                            >
                              {website.domain}
                            </a>
                            <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>
                              <span>{website.pagesCount} מסמכים</span>
                              <span>{website.chunksCount} chunks</span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons row */}
                        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <Link
                            href={`/admin/websites/${website.id}/preview`}
                            className="btn-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            ווידג׳ט
                          </Link>
                          <a
                            href={website.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            לאתר
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/demo/${website.id}`);
                            }}
                            className="flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-full transition-all"
                            style={{ background: 'rgba(160, 148, 224, 0.08)', color: '#a094e0', border: '1px solid rgba(160, 148, 224, 0.12)' }}
                            title="העתק לינק דמו"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Management panel link button */}
                        <button
                          onClick={async () => {
                            let token = website.managementToken;
                            if (!token) {
                              setGeneratingTokenId(website.id);
                              try {
                                const res = await fetch('/api/admin/websites', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ accountId: website.id }),
                                });
                                const data = await res.json();
                                if (data.token) {
                                  token = data.token;
                                  setWebsites(prev => prev.map(w =>
                                    w.id === website.id ? { ...w, managementToken: token } : w
                                  ));
                                }
                              } catch {} finally {
                                setGeneratingTokenId(null);
                              }
                            }
                            if (token) {
                              navigator.clipboard.writeText(`${window.location.origin}/manage/${token}`);
                              setCopiedManageId(website.id);
                              setTimeout(() => setCopiedManageId(null), 2000);
                            }
                          }}
                          disabled={generatingTokenId === website.id}
                          className="w-full flex items-center justify-center gap-2 mt-2 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer"
                          style={{
                            background: website.managementToken
                              ? 'rgba(94, 234, 212, 0.08)'
                              : 'rgba(251, 191, 36, 0.08)',
                            color: website.managementToken ? '#5eead4' : '#fbbf24',
                            border: `1px solid ${website.managementToken ? 'rgba(94, 234, 212, 0.15)' : 'rgba(251, 191, 36, 0.15)'}`,
                          }}
                        >
                          {generatingTokenId === website.id ? (
                            <>מייצר קישור...</>
                          ) : copiedManageId === website.id ? (
                            <>
                              <Check className="w-4 h-4" />
                              הקישור הועתק!
                            </>
                          ) : website.managementToken ? (
                            <>
                              <Copy className="w-4 h-4" />
                              העתק לינק פאנל ניהול
                            </>
                          ) : (
                            <>
                              <Settings className="w-4 h-4" />
                              צור לינק פאנל ניהול
                            </>
                          )}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="admin-card p-12 text-center"
                  >
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <Globe className="w-8 h-8" style={{ color: 'rgba(237, 233, 248, 0.2)' }} />
                    </div>
                    <h3 className="text-lg font-medium mb-2" style={{ color: '#ede9f8' }}>אין עדיין אתרים</h3>
                    <p style={{ color: 'rgba(237, 233, 248, 0.35)' }}>אתרים מתווספים דרך הקוד</p>
                  </motion.div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
