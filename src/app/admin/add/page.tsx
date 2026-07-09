'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Category } from '@/lib/pipeline/discover';
import { normalizeIgUsername } from '@/lib/pipeline/username';

type ScanMode = 'quote' | 'full';

// A quote-mode (demo) account eligible for enrich-to-full — returned by
// GET /api/admin/quote-accounts.
interface QuoteAccount {
  accountId: string;
  display_name: string;
  username: string | null;
  website_url: string | null;
}

// Smart default page caps per category type (plan: products 50, articles/info 10, legal 0).
function defaultCap(type: Category['type']): number {
  switch (type) {
    case 'products': return 50;
    case 'articles': return 10;
    case 'info': return 10;
    case 'legal': return 0;
    default: return 10;
  }
}

const TYPE_LABEL: Record<Category['type'], string> = {
  products: 'מוצרים',
  articles: 'מאמרים',
  info: 'מידע',
  legal: 'משפטי',
  other: 'אחר',
};

export default function AddAccountPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [scanMode, setScanMode] = useState<ScanMode>('full');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [youtube, setYoutube] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [archetype, setArchetype] = useState('brand');
  const [isDemo, setIsDemo] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [postsLimit, setPostsLimit] = useState('');
  const [transcribe, setTranscribe] = useState(true);
  const [maxPages, setMaxPages] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parallel-scan UX: after a successful start we show a success panel (instead of
  // navigating away) so the admin can jump to the board OR add another account.
  const [started, setStarted] = useState<{ jobId: string; name: string } | null>(null);

  // Quote-mode discover state
  const [discovering, setDiscovering] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Regular (full) mode: existing quote/demo accounts available for enrich-to-full.
  const [quoteAccounts, setQuoteAccounts] = useState<QuoteAccount[]>([]);

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) router.push('/admin');
        else setCheckingAuth(false);
      })
      .catch(() => router.push('/admin'));
  }, [router]);

  // In full (regular) mode, load existing quote/demo accounts so the admin can
  // enrich one to a full scan instead of starting from scratch.
  useEffect(() => {
    if (checkingAuth || scanMode !== 'full') return;
    fetch('/api/admin/quote-accounts')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setQuoteAccounts(Array.isArray(data) ? data : (data?.accounts ?? [])))
      .catch(() => setQuoteAccounts([]));
  }, [checkingAuth, scanMode]);

  // Categories that will actually be crawled (cap > 0), and their total page budget.
  const selectedCategories = categories
    .filter((c) => (selections[c.pathPattern] ?? 0) > 0)
    .map((c) => ({ pathPattern: c.pathPattern, cap: selections[c.pathPattern] }));
  const totalPages = selectedCategories.reduce((sum, c) => sum + c.cap, 0);

  function toggleCategory(cat: Category, checked: boolean) {
    setSelections((prev) => ({
      ...prev,
      [cat.pathPattern]: checked
        ? (prev[cat.pathPattern] > 0 ? prev[cat.pathPattern] : (defaultCap(cat.type) || 10))
        : 0,
    }));
  }

  function setCap(pathPattern: string, val: string) {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setSelections((prev) => ({ ...prev, [pathPattern]: n }));
  }

  async function handleDiscover() {
    let site = websiteUrl.trim();
    if (!site) { setError('יש להזין כתובת אתר'); return; }
    // Be forgiving about a missing protocol (common input like "example.com").
    if (!/^https?:\/\//i.test(site)) { site = 'https://' + site; setWebsiteUrl(site); }

    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: site }),
      });
      if (!res.ok) {
        // A 504 (huge/slow sitemap) returns an HTML page, so res.json() would throw —
        // parse defensively and show a clear, actionable message instead of "network error".
        let data: any = null;
        try { data = await res.json(); } catch { /* non-JSON error page */ }
        setError(
          data?.error ||
          (res.status === 504
            ? 'האתר גדול או איטי מדי לגילוי מהיר — נסה שוב, או השתמש בסריקה רגילה'
            : `שגיאה בגילוי האתר (${res.status})`),
        );
        return;
      }
      const data = await res.json();
      if (data.noSitemap || !Array.isArray(data.categories) || data.categories.length === 0) {
        setCategories([]);
        setSelections({});
        setError('לא נמצאו קטגוריות (אין sitemap) — אפשר להשתמש בסריקה רגילה');
        return;
      }
      const cats: Category[] = data.categories;
      setCategories(cats);
      const init: Record<string, number> = {};
      for (const c of cats) init[c.pathPattern] = defaultCap(c.type);
      setSelections(init);
    } catch {
      setError('שגיאת רשת — בדוק את החיבור ונסה שוב');
    } finally {
      setDiscovering(false);
    }
  }

  async function handleCreate() {
    const igUsername = normalizeIgUsername(username);
    const site = websiteUrl.trim();
    const yt = youtube.trim();
    const tt = tiktok.trim();

    // The account row needs a username. Prefer IG, then site domain, then a YT/TikTok handle.
    let accountUsername = igUsername;
    if (!accountUsername && site) {
      try { accountUsername = new URL(site.startsWith('http') ? site : `https://${site}`).host; } catch { setError('כתובת אתר לא תקינה'); return; }
    }
    if (!accountUsername && (tt || yt)) accountUsername = (tt || yt).replace(/^@/, '').slice(0, 60);

    if (scanMode === 'quote') {
      // At least one source — Instagram, website, YouTube, or TikTok.
      if (!igUsername && !site && !yt && !tt) { setError('הזן לפחות מקור אחד: אינסטגרם / אתר / יוטיוב / טיקטוק'); return; }
      // If a website was given, require a category selection so we don't crawl the whole site.
      if (site && selectedCategories.length === 0) { setError('בחר לפחות קטגוריה אחת מהאתר'); return; }
    } else if (!igUsername && !yt && !tt) {
      setError('יש להזין username (או יוטיוב/טיקטוק)');
      return;
    }
    if (!accountUsername) { setError('יש להזין מקור לסריקה'); return; }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Create (or find) the account row
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: accountUsername, type: 'creator' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'שגיאה ביצירת החשבון');
        return;
      }

      // 2. Update display name if provided (new accounts only)
      if (displayName.trim() && !data.existed) {
        await fetch(`/api/admin/accounts/${data.accountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { display_name: displayName.trim() } }),
        }).catch(() => {});
      }

      // 3. Kick off the scan pipeline. In quote mode we pass scanMode + selected categories,
      //    and omit the IG username so the start route domain-anchors (website-only scan).
      const startRes = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: igUsername || undefined,
          accountId: data.accountId,
          websiteUrl: site || undefined,
          isDemo,
          transcribe,
          archetype,
          maxPages: maxPages ? Number(maxPages) : null,
          postsLimit: postsLimit ? Number(postsLimit) : undefined,
          scanMode,
          categories: scanMode === 'quote' ? selectedCategories : undefined,
          youtube: youtube.trim() || undefined,
          tiktok: tiktok.trim() || undefined,
        }),
      });

      const startData = await startRes.json();
      if (!startRes.ok || !startData.jobId) {
        setError(startData.error || 'שגיאה בהפעלת הסריקה');
        return;
      }

      // 4. Show the success panel (parallel-scan UX) instead of navigating away,
      //    so the admin can go to the board OR immediately add another account.
      const startedName = displayName.trim() || igUsername || accountUsername;
      setStarted({ jobId: startData.jobId, name: startedName });
    } catch {
      setError('שגיאת רשת');
    } finally {
      setIsLoading(false);
    }
  }

  // Reset the per-account form fields and dismiss the success panel so the admin
  // can add another account while the previous scan keeps running in the background.
  function handleAddAnother() {
    setUsername('');
    setDisplayName('');
    setWebsiteUrl('');
    setCategories([]);
    setSelections({});
    setPostsLimit('');
    setMaxPages('');
    setError(null);
    setStarted(null);
  }

  // Enrich an existing quote/demo account to a full scan: same accountId,
  // scanMode 'full', no categories (⇒ full scope). Domain-anchored accounts
  // stay website-only; IG-anchored ones run the full IG+web flow.
  async function handleEnrich(acct: QuoteAccount) {
    setIsLoading(true);
    setError(null);
    try {
      const startRes = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: acct.accountId,
          username: acct.username || undefined,
          websiteUrl: acct.website_url || undefined,
          scanMode: 'full',
          // no categories → full scope
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData.jobId) {
        setError(startData.error || 'שגיאה בהפעלת הסריקה');
        return;
      }
      setStarted({ jobId: startData.jobId, name: acct.display_name });
    } catch {
      setError('שגיאת רשת');
    } finally {
      setIsLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#2663EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Success panel — shown after a scan starts. The scan runs in the background, so
  // the admin can go to the board, add another account, or view all scans.
  if (started) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="neon-card p-5 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-4 sm:mb-6" style={{ background: '#DCFCE8' }}>
              <span className="material-symbols-outlined text-[36px] sm:text-[48px]" style={{ color: '#22c55e' }}>check_circle</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2" style={{ color: '#1f2937' }}>
              ✅ הסריקה התחילה עבור {started.name}
            </h1>
            <p className="text-sm mb-6" style={{ color: '#4b5563' }}>
              הסריקה רצה ברקע — אפשר לעבור ללוח המעקב או להוסיף חשבון נוסף כבר עכשיו.
            </p>
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={() => router.push(`/admin/scan/${started.jobId}`)}
                className="neon-pill neon-pill-primary w-full flex items-center justify-center gap-3 py-4 font-bold text-base"
              >
                עבור ללוח
              </button>
              <button
                type="button"
                onClick={handleAddAnother}
                className="neon-pill w-full flex items-center justify-center gap-2 py-3 font-semibold text-sm"
                style={{ color: '#9334EB', border: '1px solid #9334EB' }}
              >
                הוסף חשבון נוסף
              </button>
              <Link
                href="/admin/scans"
                className="block text-center text-sm font-semibold pt-1"
                style={{ color: '#6b7280' }}
              >
                צפה בכל הסריקות
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasAnySource = !!(username.trim() || selectedCategories.length > 0 || youtube.trim() || tiktok.trim());
  const primaryDisabled = isLoading || (scanMode === 'quote'
    // Quote needs at least one source: Instagram, website categories, YouTube, or TikTok.
    ? !hasAnySource
    : !(username.trim() || youtube.trim() || tiktok.trim()));

  return (
    <div className="max-w-lg mx-auto">
      <div className="neon-card p-5 sm:p-10">
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-4 sm:mb-6" style={{ background: '#DCFCE8' }}>
            <span className="material-symbols-outlined text-[36px] sm:text-[48px]" style={{ color: '#9334EB' }}>person_add</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2" style={{ color: '#1f2937' }}>הוספת חשבון חדש</h1>
          <p className="text-sm" style={{ color: '#4b5563' }}>
            {scanMode === 'quote'
              ? 'דמו מהיר להצעת מחיר — בוחרים חלק מהאתר וסורקים אותו בלבד'
              : 'הזן את פרטי החשבון וההפעלה תתחיל סריקה מלאה אוטומטית'}
          </p>
        </div>

        {/* Persistent link to the central scans dashboard */}
        <div className="flex justify-center mb-4">
          <Link href="/admin/scans" className="text-sm font-semibold" style={{ color: '#9334EB' }}>
            צפה בכל הסריקות ←
          </Link>
        </div>

        {/* Mode selector */}
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: '#f3f4f6' }}>
          <button
            type="button"
            onClick={() => setScanMode('full')}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors"
            style={scanMode === 'full'
              ? { background: '#ffffff', color: '#1f2937', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: '#6b7280' }}
          >
            סריקה מלאה
          </button>
          <button
            type="button"
            onClick={() => setScanMode('quote')}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors"
            style={scanMode === 'quote'
              ? { background: '#ffffff', color: '#9334EB', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: '#6b7280' }}
          >
            דמו הצעת מחיר
          </button>
        </div>

        {/* Regular mode: enrich an existing quote/demo account to a full scan */}
        {scanMode === 'full' && quoteAccounts.length > 0 && (
          <div className="mb-6 rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
            <div className="p-3 text-sm font-bold" style={{ background: '#f9fafb', color: '#1f2937' }}>
              עַבֵּה חשבון דמו קיים לסריקה מלאה
            </div>
            <div>
              {quoteAccounts.map((a) => (
                <div
                  key={a.accountId}
                  className="flex items-center justify-between gap-3 p-3"
                  style={{ borderTop: '1px solid #f3f4f6' }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: '#1f2937' }}>{a.display_name}</div>
                    <div className="text-xs truncate" style={{ color: '#9ca3af', direction: 'ltr' }}>
                      {a.website_url || a.username || ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnrich(a)}
                    disabled={isLoading}
                    className="neon-pill px-4 py-2 text-sm font-semibold disabled:opacity-50 shrink-0"
                    style={{ color: '#9334EB', border: '1px solid #9334EB' }}
                  >
                    עַבֵּה
                  </button>
                </div>
              ))}
            </div>
            <div className="p-2 text-center text-xs" style={{ background: '#f9fafb', color: '#6b7280' }}>
              או מלא את הטופס למטה לסריקה מלאה חדשה
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
              שם משתמש{scanMode === 'quote' && <span className="font-normal" style={{ color: '#817a6c' }}> (אופציונלי)</span>}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              className="neon-input w-full"
              style={{ direction: 'ltr' }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
              שם תצוגה
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="הזן שם מלא"
              className="neon-input w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
              כתובת אתר {scanMode === 'quote'
                ? <span className="font-normal" style={{ color: '#817a6c' }}>(חובה לדמו)</span>
                : <span className="font-normal" style={{ color: '#817a6c' }}>(אופציונלי)</span>}
            </label>
            <input
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="neon-input w-full"
              style={{ direction: 'ltr' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
                YouTube <span className="font-normal" style={{ color: '#817a6c' }}>(אופציונלי)</span>
              </label>
              <input
                type="text"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="@channel או URL"
                className="neon-input w-full"
                style={{ direction: 'ltr' }}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
                TikTok <span className="font-normal" style={{ color: '#817a6c' }}>(אופציונלי)</span>
              </label>
              <input
                type="text"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="@handle"
                className="neon-input w-full"
                style={{ direction: 'ltr' }}
              />
            </div>
          </div>

          {/* Quote-mode discover + category table */}
          {scanMode === 'quote' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleDiscover}
                disabled={discovering || !websiteUrl.trim()}
                className="neon-pill w-full flex items-center justify-center gap-2 py-3 font-semibold text-sm disabled:opacity-50"
                style={{ color: '#9334EB', border: '1px solid #9334EB' }}
              >
                {discovering ? (
                  <>
                    <span>מגלה מה יש באתר...</span>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">travel_explore</span>
                    <span>גלה מה יש באתר</span>
                  </>
                )}
              </button>

              {categories.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', color: '#6b7280' }}>
                          <th className="p-2 text-center font-semibold">בחר</th>
                          <th className="p-2 text-right font-semibold">קטגוריה</th>
                          <th className="p-2 text-center font-semibold">סוג</th>
                          <th className="p-2 text-center font-semibold">נמצאו</th>
                          <th className="p-2 text-center font-semibold">מקס׳</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map((c) => {
                          const cap = selections[c.pathPattern] ?? 0;
                          const checked = cap > 0;
                          return (
                            <tr key={c.pathPattern} style={{ borderTop: '1px solid #f3f4f6' }}>
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleCategory(c, e.target.checked)}
                                  className="w-4 h-4"
                                />
                              </td>
                              <td className="p-2 text-right">
                                <div className="font-semibold" style={{ color: '#1f2937' }}>{c.label}</div>
                                <div className="text-xs" style={{ color: '#9ca3af', direction: 'ltr' }}>{c.pathPattern}</div>
                              </td>
                              <td className="p-2 text-center">
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                  {TYPE_LABEL[c.type]}
                                </span>
                              </td>
                              <td className="p-2 text-center" style={{ color: '#6b7280' }}>{c.count}</td>
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  value={cap}
                                  disabled={!checked}
                                  onChange={(e) => setCap(c.pathPattern, e.target.value)}
                                  className="neon-input w-16 text-center disabled:opacity-40"
                                  style={{ direction: 'ltr', padding: '4px 6px' }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 text-center text-sm font-semibold" style={{ background: '#f9fafb', color: '#1f2937' }}>
                    סה״כ עמודים לסריקה: {totalPages}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
              סוג חשבון <span className="font-normal" style={{ color: '#817a6c' }}>(archetype)</span>
            </label>
            <select
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              className="neon-input w-full"
            >
              <option value="brand">מותג (brand)</option>
              <option value="influencer">משפיען (influencer)</option>
              <option value="local_business">עסק מקומי (local_business)</option>
              <option value="service_provider">נותן שירות (service_provider)</option>
              <option value="government_ministry">משרד ממשלתי (government_ministry)</option>
              <option value="media_news">מדיה/חדשות (media_news)</option>
              <option value="tech_creator">יוצר טק (tech_creator)</option>
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDemo}
              onChange={(e) => setIsDemo(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm font-semibold" style={{ color: '#1f2937' }}>חשבון דמו</span>
          </label>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-sm font-semibold"
              style={{ color: '#9334EB' }}
            >
              <span className="material-symbols-outlined text-[18px]">{showAdvanced ? 'expand_less' : 'expand_more'}</span>
              הגדרות מתקדמות
            </button>

            {showAdvanced && (
              <div className="space-y-5 mt-4 p-4 rounded-xl" style={{ background: '#f3f4f6' }}>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
                    מספר פוסטים לסריקה
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={postsLimit}
                    onChange={(e) => setPostsLimit(e.target.value)}
                    placeholder="ברירת מחדל"
                    className="neon-input w-full"
                    style={{ direction: 'ltr' }}
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={transcribe}
                    onChange={(e) => setTranscribe(e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-semibold" style={{ color: '#1f2937' }}>תמלול וידאו</span>
                </label>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
                    מספר עמודי אתר מקסימלי <span className="font-normal" style={{ color: '#817a6c' }}>(ריק = ללא הגבלה)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    placeholder="ללא הגבלה"
                    className="neon-input w-full"
                    style={{ direction: 'ltr' }}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm p-3 rounded-xl" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
              {error}
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={handleCreate}
              disabled={primaryDisabled}
              className="neon-pill neon-pill-primary w-full flex items-center justify-center gap-3 py-4 font-bold text-base disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span>{scanMode === 'quote' ? 'יוצר דמו...' : 'יוצר ומפעיל סריקה...'}</span>
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                </>
              ) : (
                <span>{scanMode === 'quote' ? 'התחל דמו' : 'צור והתחל סריקה'}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
