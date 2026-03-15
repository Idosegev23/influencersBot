'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Zap, Globe, Check, Loader2, Copy, ExternalLink } from 'lucide-react';

type WizardStep = 'url' | 'scraping' | 'processing' | 'settings' | 'complete';

interface WizardState {
  step: WizardStep;
  url: string;
  jobId: string | null;
  accountId: string | null;
  error: string | null;
  isLoading: boolean;
  // Settings
  widgetColor: string;
  welcomeMessage: string;
}

export default function AddWebsitePage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [state, setState] = useState<WizardState>({
    step: 'url',
    url: '',
    jobId: null,
    accountId: null,
    error: null,
    isLoading: false,
    widgetColor: '#6366f1',
    welcomeMessage: 'שלום! איך אפשר לעזור?',
  });

  const [jobStatus, setJobStatus] = useState<any>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [manageLinkCopied, setManageLinkCopied] = useState(false);
  const [manageToken, setManageToken] = useState('');

  // Auth check
  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) router.push('/admin');
        else setCheckingAuth(false);
      })
      .catch(() => router.push('/admin'));
  }, [router]);

  // Poll scraping status
  useEffect(() => {
    if (state.step !== 'scraping' || !state.jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scraping/website/status?jobId=${state.jobId}`);
        const data = await res.json();
        setJobStatus(data);

        if (data.status === 'succeeded') {
          clearInterval(interval);
          setState((s) => ({ ...s, step: 'settings', accountId: data.result?.accountId || s.accountId }));
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setState((s) => ({ ...s, error: data.error?.message || 'הסריקה נכשלה', isLoading: false }));
        }
      } catch {
        // Retry on next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [state.step, state.jobId]);

  // Prevent page close during scraping
  useEffect(() => {
    if (state.step !== 'scraping') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'הסריקה עדיין רצה. בטוח לעזוב?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.step]);

  const handleStartScan = async () => {
    if (!state.url.trim()) {
      setState((s) => ({ ...s, error: 'נא להזין כתובת אתר' }));
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const accountRes = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'creator',
          username: new URL(state.url.startsWith('http') ? state.url : `https://${state.url}`).hostname,
          display_name: new URL(state.url.startsWith('http') ? state.url : `https://${state.url}`).hostname,
          is_website: true,
        }),
      });

      let accountId: string;
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        accountId = accountData.accountId || accountData.account?.id || accountData.id;
      } else {
        throw new Error('Failed to create account for website');
      }

      if (!accountId) {
        throw new Error('Failed to get account ID');
      }

      setState((s) => ({ ...s, accountId }));

      const res = await fetch('/api/scraping/website/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: state.url, accountId, maxPages: 50 }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState((s) => ({ ...s, error: data.error, isLoading: false }));
        return;
      }

      setState((s) => ({ ...s, step: 'scraping', jobId: data.jobId, isLoading: false }));
    } catch (error: any) {
      setState((s) => ({ ...s, error: error.message, isLoading: false }));
    }
  };

  const handleCancelScan = async () => {
    if (!state.jobId) return;
    try {
      await fetch('/api/scraping/website/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: state.jobId }),
      });
    } catch {
      // Ignore
    }
    setState((s) => ({ ...s, step: 'url', jobId: null, error: null, isLoading: false }));
  };

  const handleCopyCode = () => {
    const snippet = `<!-- InfluencerBot Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${state.accountId}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[#a094e0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const steps: { key: WizardStep; label: string }[] = [
    { key: 'url', label: 'כתובת' },
    { key: 'scraping', label: 'סריקה' },
    { key: 'settings', label: 'הגדרות' },
    { key: 'complete', label: 'סיום' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === state.step);

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      {/* Header */}
      <header className="relative z-10 sticky top-0 backdrop-blur-xl border-b" style={{ background: 'rgba(7, 7, 13, 0.88)', borderColor: 'rgba(255, 255, 255, 0.06)' }}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/admin/dashboard" className="transition-colors" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5" style={{ color: '#a094e0' }} />
                <h1 className="font-semibold" style={{ color: '#ede9f8' }}>הוספת אתר</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 p-6 max-w-2xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors"
                style={
                  i < currentStepIndex
                    ? { background: 'rgba(94, 234, 212, 0.15)', color: '#5eead4' }
                    : i === currentStepIndex
                    ? { background: 'rgba(160, 148, 224, 0.15)', color: '#a094e0' }
                    : { background: 'rgba(255, 255, 255, 0.04)', color: 'rgba(237, 233, 248, 0.25)' }
                }
              >
                {i < currentStepIndex ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-sm" style={{ color: i === currentStepIndex ? '#ede9f8' : 'rgba(237, 233, 248, 0.25)' }}>
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className="w-8 h-0.5" style={{ background: i < currentStepIndex ? 'rgba(94, 234, 212, 0.3)' : 'rgba(255, 255, 255, 0.06)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step: URL Input */}
        {state.step === 'url' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-card p-8">
            <h2 className="text-xl font-semibold mb-2" style={{ color: '#ede9f8' }}>הזינו את כתובת האתר</h2>
            <p className="mb-6" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>נסרוק את כל דפי האתר ונאנדקס את התוכן לצ&#39;אטבוט חכם</p>

            <input
              type="url"
              placeholder="https://example.com"
              value={state.url}
              onChange={(e) => setState((s) => ({ ...s, url: e.target.value, error: null }))}
              onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
              className="admin-input w-full !rounded-xl text-lg mb-4"
              dir="ltr"
              autoFocus
            />

            {state.error && (
              <p className="text-sm mb-4" style={{ color: '#f87171' }}>{state.error}</p>
            )}

            <button
              onClick={handleStartScan}
              disabled={state.isLoading || !state.url.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {state.isLoading ? 'מתחיל...' : 'התחל סריקה'}
            </button>
          </motion.div>
        )}

        {/* Step: Scraping */}
        {state.step === 'scraping' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-card p-8">
            <h2 className="text-xl font-semibold mb-2" style={{ color: '#ede9f8' }}>סורקים את האתר...</h2>
            <p className="mb-6" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>התהליך עשוי לקחת כמה דקות. אל תסגרו את הדף.</p>

            <div className="space-y-3 mb-6">
              {deduplicateSteps(jobStatus?.steps || []).map((step: any, i: number) => (
                <div key={step.step || i} className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                    style={
                      step.status === 'completed' ? { background: 'rgba(94, 234, 212, 0.15)', color: '#5eead4' } :
                      step.status === 'running' ? { background: 'rgba(160, 148, 224, 0.15)', color: '#a094e0' } :
                      step.status === 'failed' ? { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' } :
                      { background: 'rgba(255, 255, 255, 0.04)', color: 'rgba(237, 233, 248, 0.25)' }
                    }
                  >
                    {step.status === 'completed' ? <Check className="w-3 h-3" /> :
                     step.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : ''}
                  </div>
                  <span className="text-sm" style={{
                    color: step.status === 'running' ? '#ede9f8' : step.status === 'completed' ? '#5eead4' : 'rgba(237, 233, 248, 0.35)'
                  }}>
                    {step.message}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: '#a094e0' }}
                initial={{ width: '5%' }}
                animate={{ width: `${getLatestProgress(jobStatus?.steps || [])}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {state.error && (
              <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <p className="text-sm" style={{ color: '#f87171' }}>{state.error}</p>
                <button
                  onClick={() => setState((s) => ({ ...s, step: 'url', error: null, jobId: null }))}
                  className="mt-2 text-sm" style={{ color: '#a094e0' }}
                >
                  נסה שוב
                </button>
              </div>
            )}

            <button
              onClick={handleCancelScan}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-full transition-all"
              style={{ color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.15)' }}
            >
              ביטול סריקה
            </button>
          </motion.div>
        )}

        {/* Step: Settings */}
        {state.step === 'settings' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-card p-8">
            <h2 className="text-xl font-semibold mb-2" style={{ color: '#ede9f8' }}>הגדרות ווידג&#39;ט</h2>
            <p className="mb-6" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>התאימו את הצ&#39;אטבוט לאתר שלכם</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>צבע ראשי</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={state.widgetColor}
                    onChange={(e) => setState((s) => ({ ...s, widgetColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer"
                    style={{ border: '1px solid rgba(255, 255, 255, 0.06)' }}
                  />
                  <input
                    type="text"
                    value={state.widgetColor}
                    onChange={(e) => setState((s) => ({ ...s, widgetColor: e.target.value }))}
                    className="admin-input flex-1 !rounded-xl"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>הודעת ברכה</label>
                <input
                  type="text"
                  value={state.welcomeMessage}
                  onChange={(e) => setState((s) => ({ ...s, welcomeMessage: e.target.value }))}
                  className="admin-input w-full !rounded-xl"
                />
              </div>
            </div>

            <button
              onClick={async () => {
                setState((s) => ({ ...s, isLoading: true }));
                try {
                  // Generate management token for client access
                  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                  setManageToken(token);

                  await fetch(`/api/admin/accounts/${state.accountId}/config`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      widget: {
                        primaryColor: state.widgetColor,
                        welcomeMessage: state.welcomeMessage,
                        position: 'bottom-right',
                        managementToken: token,
                      },
                    }),
                  });
                } catch {
                  // Continue even if save fails
                }
                setState((s) => ({ ...s, step: 'complete', isLoading: false }));
              }}
              disabled={state.isLoading}
              className="btn-primary w-full mt-6 flex items-center justify-center gap-2 py-3 font-medium disabled:opacity-50"
            >
              {state.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {state.isLoading ? 'שומר...' : 'סיום'}
            </button>
          </motion.div>
        )}

        {/* Step: Complete */}
        {state.step === 'complete' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="admin-card p-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(94, 234, 212, 0.12)', border: '1px solid rgba(94, 234, 212, 0.18)' }}>
                <Check className="w-8 h-8" style={{ color: '#5eead4' }} />
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#ede9f8' }}>האתר נסרק בהצלחה!</h2>
              <p className="mb-6" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>הווידג&#39;ט מוכן להטמעה באתר שלכם</p>

              {/* Scan results */}
              {jobStatus?.result && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <p className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{jobStatus.result.pagesScraped || 0}</p>
                    <p className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>דפים</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <p className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{formatNumber(jobStatus.result.totalWords || 0)}</p>
                    <p className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>מילים</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <p className="text-2xl font-bold" style={{ color: '#ede9f8' }}>{jobStatus.result.totalImages || 0}</p>
                    <p className="text-xs" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>תמונות</p>
                  </div>
                </div>
              )}
            </div>

            {/* Embed Code */}
            <div className="admin-card p-6">
              <h3 className="text-lg font-semibold mb-3" style={{ color: '#ede9f8' }}>קוד הטמעה</h3>
              <p className="text-sm mb-4" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                הדביקו את הקוד הזה לפני תגית {'</body>'} בכל דפי האתר שלכם
              </p>

              <div className="rounded-xl p-4 font-mono text-sm mb-4" dir="ltr" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#ede9f8' }}>
                {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-account-id="${state.accountId}"></script>`}
              </div>

              <button
                onClick={handleCopyCode}
                className="btn-ghost w-full flex items-center justify-center gap-2 py-2.5"
              >
                {codeCopied ? (
                  <><Check className="w-4 h-4" style={{ color: '#5eead4' }} /> הועתק!</>
                ) : (
                  <><Copy className="w-4 h-4" /> העתק קוד</>
                )}
              </button>
            </div>

            {/* Management Link */}
            {manageToken && (
              <div className="admin-card p-6">
                <h3 className="text-lg font-semibold mb-3" style={{ color: '#ede9f8' }}>לינק ניהול ללקוח</h3>
                <p className="text-sm mb-4" style={{ color: 'rgba(237, 233, 248, 0.35)' }}>
                  שלחו את הלינק הזה לבעל האתר — הוא יוכל לנהל הנחיות, שאלות נפוצות וידע
                </p>
                <div className="rounded-xl p-4 font-mono text-sm mb-4" dir="ltr" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#ede9f8', wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/manage/${manageToken}` : ''}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/manage/${manageToken}`);
                    setManageLinkCopied(true);
                    setTimeout(() => setManageLinkCopied(false), 2000);
                  }}
                  className="btn-ghost w-full flex items-center justify-center gap-2 py-2.5"
                >
                  {manageLinkCopied ? (
                    <><Check className="w-4 h-4" style={{ color: '#5eead4' }} /> הועתק!</>
                  ) : (
                    <><Copy className="w-4 h-4" /> העתק לינק ניהול</>
                  )}
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Link
                href={`/admin/websites/${state.accountId}/preview`}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
              >
                <ExternalLink className="w-4 h-4" /> צפה בהדגמה
              </Link>
              <Link
                href="/admin/dashboard"
                className="btn-ghost flex-1 flex items-center justify-center gap-2 py-3"
              >
                חזרה לדשבורד
              </Link>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/** Show only the latest entry per step name */
function deduplicateSteps(steps: any[]): any[] {
  const map = new Map<string, any>();
  for (const s of steps) {
    map.set(s.step, s);
  }
  return Array.from(map.values());
}

/** Get the highest progress value from step logs */
function getLatestProgress(steps: any[]): number {
  if (!steps || steps.length === 0) return 5;
  let max = 5;
  for (const s of steps) {
    if (s.progress > max) max = s.progress;
  }
  return max;
}
