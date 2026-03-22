'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AddAccountPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result after creation
  const [accountId, setAccountId] = useState<string | null>(null);
  const [existed, setExisted] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) router.push('/admin');
        else setCheckingAuth(false);
      })
      .catch(() => router.push('/admin'));
  }, [router]);

  const igConnectLink = accountId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/instagram/connect?accountId=${accountId}`
    : '';

  function copyToClipboard(text: string, type: 'id' | 'link') {
    navigator.clipboard.writeText(text);
    if (type === 'id') { setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); }
    else { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
  }

  async function handleCreate() {
    const trimmed = username.trim().replace(/^@/, '');
    if (!trimmed) { setError('יש להזין username'); return; }

    setIsLoading(true);
    setError(null);

    try {
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

      setAccountId(data.accountId);
      setExisted(!!data.existed);

      // Update display name if provided
      if (displayName.trim() && !data.existed) {
        await fetch(`/api/admin/accounts/${data.accountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { display_name: displayName.trim() } }),
        }).catch(() => {});
      }
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
      {!accountId ? (
        /* ── Step 1: Account Creation Form ── */
        <div className="neon-card p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: '#DCFCE8' }}>
              <span className="material-symbols-outlined text-[48px]" style={{ color: '#9334EB' }}>person_add</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2" style={{ color: '#1f2937' }}>הוספת חשבון חדש</h1>
            <p className="text-sm" style={{ color: '#4b5563' }}>הזן את פרטי החשבון החדש כדי להתחיל בניהול</p>
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
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="הזן שם מלא"
                className="neon-input w-full"
              />
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
                    <span>יוצר חשבון...</span>
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </>
                ) : (
                  <span>צור חשבון</span>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Step 2: Success — show ID + OAuth link ── */
        <div className="neon-card p-10" style={{ borderRight: '3px solid #9334EB' }}>
          <div className="flex items-center gap-6 mb-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(23, 163, 74, 0.15)' }}>
              <span className="material-symbols-outlined text-[32px] font-bold" style={{ color: '#9334EB', fontVariationSettings: "'FILL' 1" }}>check</span>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: '#1f2937' }}>
                {existed ? 'חשבון קיים נמצא' : 'החשבון נוצר בהצלחה!'}
              </h2>
              <p className="font-bold" style={{ color: '#9334EB' }}>
                @{username.trim().replace(/^@/, '')}
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-10">
            {/* Account ID row */}
            <div className="flex items-center justify-between p-5 rounded-xl" style={{ background: '#f3f4f6' }}>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#817a6c' }}>מזהה חשבון</span>
                <span className="font-mono font-medium" style={{ color: '#1f2937' }}>{accountId.slice(0, 12)}...</span>
              </div>
              <button
                onClick={() => copyToClipboard(accountId, 'id')}
                className="p-2 rounded-full transition-colors"
                style={{ background: '#fff', color: copiedId ? '#9334EB' : '#DC2627' }}
              >
                <span className="material-symbols-outlined text-[20px]">{copiedId ? 'check' : 'content_copy'}</span>
              </button>
            </div>

            {/* IG Connect link row */}
            <div className="flex items-center justify-between p-5 rounded-xl" style={{ background: '#f3f4f6' }}>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#817a6c' }}>חיבור IG</span>
                <span className="font-medium truncate" style={{ color: '#1f2937' }}>{igConnectLink.slice(0, 35)}...</span>
              </div>
              <button
                onClick={() => copyToClipboard(igConnectLink, 'link')}
                className="px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex-shrink-0"
                style={{ background: copiedLink ? 'rgba(23, 163, 74, 0.15)' : 'rgba(147, 52, 235, 0.2)', color: copiedLink ? '#1f2937' : '#1f2937' }}
              >
                {copiedLink ? 'הועתק!' : 'העתק לינק'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href={`/admin/influencers/${accountId}`}
              className="neon-pill neon-pill-secondary flex-1 py-4 font-bold text-center"
            >
              צפה בחשבון
            </Link>
            <button
              onClick={() => {
                setAccountId(null);
                setUsername('');
                setDisplayName('');
                setExisted(false);
              }}
              className="neon-pill neon-pill-outline flex-1 py-4 font-bold text-center"
            >
              הוסף חשבון נוסף
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
