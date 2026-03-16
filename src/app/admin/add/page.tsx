'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Instagram, UserPlus, Copy, Link2, CheckCircle, Loader2 } from 'lucide-react';

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
      <div className="min-h-screen admin-panel flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel p-6" dir="rtl">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/admin/influencers"
            className="w-10 h-10 flex items-center justify-center rounded-full transition-all"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
          >
            <ArrowRight className="w-5 h-5" style={{ color: '#ede9f8' }} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#ede9f8' }}>הוספת חשבון</h1>
            <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>צור חשבון חדש וקבל קישור התחברות לאינסטגרם</p>
          </div>
        </div>

        {!accountId ? (
          /* ── Step 1: Enter username ── */
          <div className="admin-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <UserPlus className="w-5 h-5" style={{ color: '#a094e0' }} />
              <h2 className="text-lg font-bold" style={{ color: '#ede9f8' }}>פרטי החשבון</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  Instagram Username *
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-lg" style={{ color: 'rgba(237, 233, 248, 0.3)' }}>@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="username"
                    className="admin-input flex-1"
                    style={{ direction: 'ltr' }}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.5)' }}>
                  שם תצוגה (אופציונלי)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="מירן בוזגלו"
                  className="admin-input"
                />
              </div>

              {error && (
                <div className="text-sm p-3 rounded-xl" style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={isLoading || !username.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> יוצר חשבון...</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> צור חשבון</>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ── Step 2: Account created — show ID + OAuth link ── */
          <div className="space-y-4">
            {/* Success banner */}
            <div className="admin-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(94, 234, 212, 0.1)' }}>
                  <CheckCircle className="w-5 h-5" style={{ color: '#5eead4' }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#ede9f8' }}>
                    {existed ? 'חשבון קיים נמצא' : 'חשבון נוצר בהצלחה!'}
                  </h2>
                  <p className="text-sm" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                    @{username.trim().replace(/^@/, '')}
                  </p>
                </div>
              </div>

              {/* Copy Account ID */}
              <button
                onClick={() => copyToClipboard(accountId, 'id')}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl text-sm transition-all mb-2"
                style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
              >
                <div className="flex items-center gap-2" style={{ color: '#ede9f8' }}>
                  <Copy className="w-4 h-4" />
                  <span>העתק Account ID</span>
                </div>
                <span className="text-xs font-mono" style={{ color: copiedId ? '#5eead4' : 'rgba(237, 233, 248, 0.3)' }}>
                  {copiedId ? 'הועתק!' : accountId.slice(0, 8) + '...'}
                </span>
              </button>
            </div>

            {/* Instagram OAuth Link */}
            <div className="admin-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Instagram className="w-5 h-5" style={{ color: '#E1306C' }} />
                <h2 className="text-lg font-bold" style={{ color: '#ede9f8' }}>קישור התחברות לאינסטגרם</h2>
              </div>

              <p className="text-sm mb-4" style={{ color: 'rgba(237, 233, 248, 0.4)' }}>
                שלח את הקישור הזה למשפיענ/ית — ברגע שיתחברו תראה את הסטטוס בדף החשבון.
              </p>

              <div className="p-3 rounded-xl mb-3 overflow-x-auto" style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <code className="text-xs break-all" style={{ color: 'rgba(237, 233, 248, 0.5)', direction: 'ltr', display: 'block' }}>
                  {igConnectLink}
                </code>
              </div>

              <button
                onClick={() => copyToClipboard(igConnectLink, 'link')}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(225, 48, 108, 0.1)', border: '1px solid rgba(225, 48, 108, 0.25)', color: '#ede9f8' }}
              >
                {copiedLink ? (
                  <><CheckCircle className="w-4 h-4" style={{ color: '#5eead4' }} /> הועתק!</>
                ) : (
                  <><Link2 className="w-4 h-4" style={{ color: '#E1306C' }} /> העתק קישור התחברות</>
                )}
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                href={`/admin/influencers/${accountId}`}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm"
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
                className="btn-ghost flex-1 py-3 text-sm"
              >
                הוסף עוד
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
