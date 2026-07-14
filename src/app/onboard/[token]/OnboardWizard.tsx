'use client';

import { useEffect, useState, useCallback } from 'react';

interface StatusData {
  accountName: string;
  clientName: string;
  status: 'draft' | 'filled' | 'scanning' | 'ready';
  sources: { instagram?: string; website?: string; youtube?: string; tiktok?: string };
  connected: boolean;
  igUsername: string | null;
  jobId: string | null;
  connectUrl: string;
}

interface Progress {
  status: string;
  percent?: number;
  currentStep?: string;
  completedSteps?: number;
  totalSteps?: number;
}

const BRAND = '#883fe2';

/** Locally persist the typed fields so they survive the full-page IG-connect round trip. */
function loadSaved(token: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(`onboard:${token}`) || '{}'); } catch { return {}; }
}

export default function OnboardWizard({ token }: { token: string }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [phase, setPhase] = useState<'loading' | 'form' | 'scanning' | 'done' | 'error'>('loading');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState('');

  const [website, setWebsite] = useState(() => loadSaved(token).website || '');
  const [tiktok, setTiktok] = useState(() => loadSaved(token).tiktok || '');
  const [youtube, setYoutube] = useState(() => loadSaved(token).youtube || '');

  // Persist fields on every change (survives the IG-connect navigation).
  useEffect(() => {
    try { localStorage.setItem(`onboard:${token}`, JSON.stringify({ website, tiktok, youtube })); } catch { /* ignore */ }
  }, [token, website, tiktok, youtube]);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/onboard/${token}/status`);
    if (!res.ok) return;
    const d: StatusData = await res.json();
    setData(d);
    setWebsite((v) => v || d.sources.website || '');
    setTiktok((v) => v || d.sources.tiktok || '');
    setYoutube((v) => v || d.sources.youtube || '');
    if ((d.status === 'scanning' || d.status === 'ready') && d.jobId) {
      setJobId(d.jobId);
      setPhase(d.status === 'ready' ? 'done' : 'scanning');
    } else {
      setPhase('form');
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
    const onFocus = () => loadStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStatus]);

  // Poll scan progress
  useEffect(() => {
    if (phase !== 'scanning' || !jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/pipeline/status/${jobId}`);
        if (res.ok) {
          const p: Progress = await res.json();
          setProgress(p);
          const s = (p.status || '').toLowerCase();
          if (['completed', 'complete', 'done', 'success', 'succeeded', 'ready'].includes(s)) {
            if (!stop) setPhase('done');
          } else if (['failed', 'cancelled', 'canceled', 'error'].includes(s)) {
            if (!stop) setPhase('error');
          }
        }
      } catch { /* keep polling */ }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(id); };
  }, [phase, jobId]);

  async function start() {
    if (starting || !data?.connected) return;
    setStarting(true);
    setErr('');
    try {
      const res = await fetch(`/api/onboard/${token}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website, tiktok, youtube }),
      });
      const json = await res.json();
      if (res.status === 422) { setErr('צריך לחבר אינסטגרם קודם'); return; }
      if (!res.ok || !json.jobId) { setErr('משהו השתבש, נסו שוב'); return; }
      setJobId(json.jobId);
      setPhase('scanning');
    } catch {
      setErr('משהו השתבש, נסו שוב');
    } finally {
      setStarting(false);
    }
  }

  const canStart = !!data?.connected; // Instagram is the only requirement; the rest is optional.
  const pct = Math.max(2, Math.min(100, Math.round(progress?.percent ?? 0)));

  return (
    <div dir="rtl" style={{ direction: 'rtl' }} className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="fixed inset-0 -z-10" style={{ background: `radial-gradient(1200px 600px at 50% -10%, ${BRAND}22, transparent), linear-gradient(180deg,#0b0b12,#141021)` }} />
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-white font-black" style={{ background: BRAND }}>B</span>
            <span className="text-xl font-extrabold text-white tracking-tight">BestieAI</span>
          </div>
        </div>

        <div className="rounded-3xl p-7 shadow-2xl" style={{ background: 'rgba(255,255,255,0.98)' }}>
          {phase === 'loading' && <div className="py-16 text-center text-gray-400">טוען…</div>}

          {phase === 'form' && data && (
            <>
              <h1 className="text-2xl font-extrabold text-gray-900">שמחים שהצטרפת, {data.accountName} 🎉</h1>
              <p className="text-sm text-gray-500 mt-1 mb-6">כמה פרטים אחרונים ומתחילים לבנות לך עוזר AI חכם.</p>

              {/* Instagram connect */}
              <div className="rounded-2xl border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-900">חשבון אינסטגרם</div>
                  {data.connected ? (
                    <span className="text-sm font-medium text-green-600">מחובר — @{data.igUsername} ✓</span>
                  ) : (
                    <a href={data.connectUrl} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: BRAND }}>
                      חבר/י אינסטגרם
                    </a>
                  )}
                </div>
                {!data.connected && <p className="text-xs text-gray-400 mt-2">מתחברים פעם אחת — כדי שהבוט ילמד את התוכן שלך ויענה לעוקבים.</p>}
              </div>

              {/* Fields */}
              <div className="space-y-3">
                <Field label="אתר אינטרנט" value={website} onChange={setWebsite} placeholder="https://…" />
                <Field label="שם משתמש טיקטוק" value={tiktok} onChange={setTiktok} placeholder="@username" />
                <Field label="שם משתמש יוטיוב" value={youtube} onChange={setYoutube} placeholder="@channel" />
              </div>
              <p className="text-xs text-gray-400 mt-2">כל השדות אופציונליים — מלא/י מה שיש. הדבר היחיד שחובה זה חיבור אינסטגרם.</p>

              {err && <div className="text-sm text-red-600 mt-3">{err}</div>}

              <button
                onClick={start}
                disabled={!canStart || starting}
                className="w-full mt-6 py-3 rounded-2xl text-white font-bold text-base disabled:opacity-40 transition"
                style={{ background: BRAND }}
              >
                {starting ? 'מתחילים…' : 'התחילו לבנות את החשבון שלי 🚀'}
              </button>
              {!data.connected && <p className="text-center text-xs text-gray-400 mt-2">חברו אינסטגרם כדי להתחיל</p>}
            </>
          )}

          {phase === 'scanning' && (
            <div className="py-4 text-center">
              <h1 className="text-2xl font-extrabold text-gray-900">בונים את החשבון שלך…</h1>
              <p className="text-sm text-gray-500 mt-1 mb-6">סורקים את כל התוכן ובונים את הפרסונה. זה יכול לקחת כמה שעות — אפשר לסגור את הדף.</p>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: BRAND }} />
              </div>
              <div className="text-sm text-gray-500 mt-3">
                {pct}% {progress?.currentStep ? `· ${progress.currentStep}` : ''}
                {typeof progress?.completedSteps === 'number' && typeof progress?.totalSteps === 'number'
                  ? ` · ${progress.completedSteps}/${progress.totalSteps}` : ''}
              </div>
              <p className="text-xs text-gray-400 mt-6">כשנסיים — נשלח לך הודעת וואטסאפ ומייל עם קישור לבסטי שלך.</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="py-8 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <h1 className="text-2xl font-extrabold text-gray-900">הכל מוכן!</h1>
              <p className="text-sm text-gray-500 mt-2">שלחנו לך לוואטסאפ ולמייל קישור לבסטי שלך. נתראה שם!</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-8 text-center">
              <div className="text-5xl mb-3">⚠️</div>
              <h1 className="text-2xl font-extrabold text-gray-900">משהו השתבש בסריקה</h1>
              <p className="text-sm text-gray-500 mt-2">הצוות שלנו קיבל התראה ויטפל בזה — נחזור אליך בהקדם.</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-5">מאובטח · BestieAI © LDRS</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}{required && <span className="text-red-500"> *</span>}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
        style={{ boxShadow: 'none' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = BRAND; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
      />
    </label>
  );
}
