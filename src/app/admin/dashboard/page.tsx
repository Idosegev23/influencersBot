'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import Link from 'next/link';
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
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#9334EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Success Notification */}
      {showCreatedNotification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-28 left-1/2 -translate-x-1/2 z-50 neon-pill neon-pill-primary px-5 py-3 text-sm font-medium shadow-lg"
        >
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          צ&apos;אטבוט נוצר בהצלחה! - /chat/{createdSubdomain}
        </motion.div>
      )}

      {/* Tab Bar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setActiveTab('social')}
          className={`neon-pill flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
            activeTab === 'social' ? 'neon-pill-primary' : 'neon-pill-ghost'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">group</span>
          חשבונות סושיאל
        </button>
        <button
          onClick={() => setActiveTab('websites')}
          className={`neon-pill flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
            activeTab === 'websites' ? 'neon-pill-secondary' : 'neon-pill-ghost'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">language</span>
          אתרים
        </button>

        <div className="w-px h-6 mx-1 bg-[#d1d5db]/20" />

        <Link
          href="/admin/onboarding"
          className="neon-pill neon-pill-ghost flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
          אונבורדינג
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
              className="neon-stat-card p-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#9334EB]/10">
                  <span className="material-symbols-outlined text-[24px] text-[#9334EB]">group</span>
                </div>
                <div>
                  <p className="text-3xl font-bold font-headline text-[#1f2937]">{filteredInfluencers.length}</p>
                  <p className="text-sm text-[#4b5563]">חשבונות</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="neon-stat-card p-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#2663EB]/10">
                  <span className="material-symbols-outlined text-[24px] text-[#2663EB]">chat_bubble</span>
                </div>
                <div>
                  <p className="text-3xl font-bold font-headline text-[#1f2937]">
                    {filteredInfluencers.filter((i) => i.is_active).length}
                  </p>
                  <p className="text-sm text-[#4b5563]">פעילים</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="neon-stat-card p-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#DC2627]/10">
                  <span className="material-symbols-outlined text-[24px] text-[#DC2627]">bar_chart</span>
                </div>
                <div>
                  <p className="text-3xl font-bold font-headline text-[#1f2937]">
                    {formatNumber(filteredInfluencers.reduce((sum, i) => sum + (i.followers_count || 0), 0))}
                  </p>
                  <p className="text-sm text-[#4b5563]">עוקבים כולל</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Action bar with sub-filter */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold font-headline text-[#1f2937]">חשבונות</h2>
              {/* Sub-filter pills */}
              <div className="flex items-center gap-1 rounded-full p-1 bg-[#d1d5db]/10 border border-[#d1d5db]/15">
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
                        ? 'bg-[#9334EB]/15 text-[#1f2937] border border-[#9334EB]/30'
                        : 'text-[#4b5563] border border-transparent hover:text-[#474747]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Link
                href="/admin/influencers"
                className="neon-pill neon-pill-ghost flex items-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-[16px]">group</span>
                תצוגה מפורטת
              </Link>
              <Link
                href="/admin/add"
                className="neon-pill neon-pill-primary flex items-center gap-2 text-sm font-medium"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
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
                  className="neon-card p-4 transition-all hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    {influencer.profile_pic_url ? (
                      <div className="relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-[#9334EB]/20">
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
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 bg-[#d1d5db]/10 border-2 border-[#d1d5db]/15 text-[#d1d5db]">
                        ?
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate text-[#1f2937]">
                        {influencer.display_name}
                      </h3>
                      <p className="text-sm text-[#4b5563]">@{influencer.username}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-[#d1d5db]">{formatNumber(influencer.followers_count)} עוקבים</span>
                        <span
                          className={`inline-flex items-center text-[11px] py-0.5 px-2 rounded-full font-medium ${
                            influencer.is_active
                              ? 'bg-[#9334EB]/15 text-[#1f2937] border border-[#9334EB]/30'
                              : 'bg-[#d1d5db]/10 text-[#4b5563] border border-[#d1d5db]/20'
                          }`}
                        >
                          {influencer.is_active ? 'פעיל' : 'לא פעיל'}
                        </span>
                        {influencer.type === 'brand' && (
                          <span className="inline-flex items-center text-[11px] py-0.5 px-2 rounded-full font-medium bg-[#2663EB]/15 text-[#2663EB] border border-[#2663EB]/30">
                            מותג
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#d1d5db]/10">
                    <a
                      href={`/chat/${influencer.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="neon-pill neon-pill-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      צפייה
                    </a>
                    <Link
                      href={`/admin/influencers/${influencer.id}`}
                      className="neon-pill neon-pill-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                    >
                      <span className="material-symbols-outlined text-[14px]">settings</span>
                      ניהול
                    </Link>
                    <button
                      onClick={() => handleDelete(influencer)}
                      className="neon-pill neon-pill-danger flex items-center justify-center gap-1 px-3 py-2 text-sm"
                      title="מחק"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="neon-card p-12 text-center"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[#d1d5db]/10 border border-[#d1d5db]/15">
                <span className="material-symbols-outlined text-[32px] text-[#d1d5db]">group</span>
              </div>
              <h3 className="text-lg font-medium font-headline mb-2 text-[#1f2937]">
                {accountFilter === 'all' ? 'אין עדיין חשבונות' : accountFilter === 'creator' ? 'אין משפיענים' : 'אין מותגים'}
              </h3>
              <p className="mb-6 text-[#4b5563]">
                {accountFilter === 'all' ? 'התחילו על ידי הוספת חשבון ראשון' : 'לא נמצאו חשבונות מסוג זה'}
              </p>
              <Link
                href="/admin/add"
                className="neon-pill neon-pill-primary inline-flex items-center gap-2 px-6 py-3 font-medium"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
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
              <div className="w-8 h-8 border-2 border-[#2663EB] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Website Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="neon-stat-card p-6"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#2663EB]/10">
                      <span className="material-symbols-outlined text-[24px] text-[#2663EB]">language</span>
                    </div>
                    <div>
                      <p className="text-3xl font-bold font-headline text-[#1f2937]">{websites.length}</p>
                      <p className="text-sm text-[#4b5563]">אתרים</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="neon-stat-card p-6"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#9334EB]/10">
                      <span className="material-symbols-outlined text-[24px] text-[#9334EB]">description</span>
                    </div>
                    <div>
                      <p className="text-3xl font-bold font-headline text-[#1f2937]">
                        {websites.reduce((sum, w) => sum + w.pagesCount, 0)}
                      </p>
                      <p className="text-sm text-[#4b5563]">מסמכים</p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Action bar */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold font-headline text-[#1f2937]">אתרים</h2>
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
                      className="neon-card p-4 transition-all hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        {website.profilePic ? (
                          <div className="relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-[#d1d5db]/15">
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
                            <span className="material-symbols-outlined text-[28px]" style={{ color: website.primaryColor }}>language</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate text-[#1f2937]">
                            {website.displayName}
                          </h3>
                          <a
                            href={website.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm truncate block transition-colors text-[#2663EB] hover:text-[#9334EB]"
                          >
                            {website.domain}
                          </a>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-[#d1d5db]">
                            <span>{website.pagesCount} מסמכים</span>
                            <span>{website.chunksCount} chunks</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons row */}
                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#d1d5db]/10">
                        <Link
                          href={`/admin/websites/${website.id}/preview`}
                          className="neon-pill neon-pill-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          ווידג׳ט
                        </Link>
                        <a
                          href={website.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="neon-pill neon-pill-ghost flex-1 flex items-center justify-center gap-1 py-2 text-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">language</span>
                          לאתר
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/demo/${website.id}`);
                          }}
                          className="neon-pill neon-pill-outline flex items-center justify-center gap-1 px-3 py-2 text-sm"
                          title="העתק לינק דמו"
                        >
                          <span className="material-symbols-outlined text-[14px]">content_copy</span>
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
                        className={`w-full flex items-center justify-center gap-2 mt-2 py-2.5 text-sm font-medium rounded-full transition-all cursor-pointer ${
                          website.managementToken
                            ? 'bg-[#9334EB]/10 text-[#1f2937] border border-[#9334EB]/25 hover:bg-[#9334EB]/20'
                            : 'bg-[#DC2627]/10 text-[#DC2627] border border-[#DC2627]/25 hover:bg-[#DC2627]/20'
                        }`}
                      >
                        {generatingTokenId === website.id ? (
                          <>מייצר קישור...</>
                        ) : copiedManageId === website.id ? (
                          <>
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            הקישור הועתק!
                          </>
                        ) : website.managementToken ? (
                          <>
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                            העתק לינק פאנל ניהול
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[16px]">settings</span>
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
                  className="neon-card p-12 text-center"
                >
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[#d1d5db]/10 border border-[#d1d5db]/15">
                    <span className="material-symbols-outlined text-[32px] text-[#d1d5db]">language</span>
                  </div>
                  <h3 className="text-lg font-medium font-headline mb-2 text-[#1f2937]">אין עדיין אתרים</h3>
                  <p className="text-[#4b5563]">אתרים מתווספים דרך הקוד</p>
                </motion.div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#9334EB] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
