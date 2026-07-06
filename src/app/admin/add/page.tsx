'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AddAccountPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isDemo, setIsDemo] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [postsLimit, setPostsLimit] = useState('');
  const [transcribe, setTranscribe] = useState(true);
  const [maxPages, setMaxPages] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) router.push('/admin');
        else setCheckingAuth(false);
      })
      .catch(() => router.push('/admin'));
  }, [router]);

  async function handleCreate() {
    const trimmed = username.trim().replace(/^@/, '');
    if (!trimmed) { setError('יש להזין username'); return; }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Create (or find) the account row
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed, type: 'creator' }),
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

      // 3. Kick off the scan pipeline
      const startRes = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmed,
          accountId: data.accountId,
          websiteUrl: websiteUrl.trim() || undefined,
          isDemo,
          transcribe,
          maxPages: maxPages ? Number(maxPages) : null,
          postsLimit: postsLimit ? Number(postsLimit) : undefined,
        }),
      });

      const startData = await startRes.json();
      if (!startRes.ok || !startData.jobId) {
        setError(startData.error || 'שגיאה בהפעלת הסריקה');
        return;
      }

      // 4. Navigate to the live progress board
      router.push(`/admin/scan/${startData.jobId}`);
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

  return (
    <div className="max-w-lg mx-auto">
      <div className="neon-card p-5 sm:p-10">
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-4 sm:mb-6" style={{ background: '#DCFCE8' }}>
            <span className="material-symbols-outlined text-[36px] sm:text-[48px]" style={{ color: '#9334EB' }}>person_add</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2" style={{ color: '#1f2937' }}>הוספת חשבון חדש</h1>
          <p className="text-sm" style={{ color: '#4b5563' }}>הזן את פרטי החשבון וההפעלה תתחיל סריקה מלאה אוטומטית</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold mr-2" style={{ color: '#1f2937' }}>
              שם משתמש
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
              כתובת אתר <span className="font-normal" style={{ color: '#817a6c' }}>(אופציונלי)</span>
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
              disabled={isLoading || !username.trim()}
              className="neon-pill neon-pill-primary w-full flex items-center justify-center gap-3 py-4 font-bold text-base disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span>יוצר ומפעיל סריקה...</span>
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                </>
              ) : (
                <span>צור והתחל סריקה</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
