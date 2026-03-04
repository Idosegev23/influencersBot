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
      // First, create an account for this website
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

      // Start the scan
      const res = await fetch('/api/scraping/website/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: state.url,
          accountId,
          maxPages: 50,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState((s) => ({ ...s, error: data.error, isLoading: false }));
        return;
      }

      setState((s) => ({
        ...s,
        step: 'scraping',
        jobId: data.jobId,
        isLoading: false,
      }));
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
      // Ignore errors — we're resetting anyway
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
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors">
                <ArrowRight className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h1 className="font-semibold text-white">הוספת אתר</h1>
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
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  i < currentStepIndex
                    ? 'bg-green-500 text-white'
                    : i === currentStepIndex
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {i < currentStepIndex ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm ${i === currentStepIndex ? 'text-white' : 'text-gray-500'}`}>
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${i < currentStepIndex ? 'bg-green-500' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step: URL Input */}
        {state.step === 'url' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-card p-8">
            <h2 className="text-xl font-semibold text-white mb-2">הזינו את כתובת האתר</h2>
            <p className="text-gray-400 mb-6">נסרוק את כל דפי האתר ונאנדקס את התוכן לצ'אטבוט חכם</p>

            <input
              type="url"
              placeholder="https://example.com"
              value={state.url}
              onChange={(e) => setState((s) => ({ ...s, url: e.target.value, error: null }))}
              onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
              className="admin-input w-full text-lg mb-4"
              dir="ltr"
              autoFocus
            />

            {state.error && (
              <p className="text-red-400 text-sm mb-4">{state.error}</p>
            )}

            <button
              onClick={handleStartScan}
              disabled={state.isLoading || !state.url.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5" />
              )}
              {state.isLoading ? 'מתחיל...' : 'התחל סריקה'}
            </button>
          </motion.div>
        )}

        {/* Step: Scraping */}
        {state.step === 'scraping' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-card p-8">
            <h2 className="text-xl font-semibold text-white mb-2">סורקים את האתר...</h2>
            <p className="text-gray-400 mb-6">התהליך עשוי לקחת כמה דקות. אל תסגרו את הדף.</p>

            <div className="space-y-3 mb-6">
              {deduplicateSteps(jobStatus?.steps || []).map((step: any, i: number) => (
                <div key={step.step || i} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    step.status === 'completed' ? 'bg-green-500 text-white' :
                    step.status === 'running' ? 'bg-indigo-500 text-white animate-pulse' :
                    step.status === 'failed' ? 'bg-red-500 text-white' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {step.status === 'completed' ? <Check className="w-3 h-3" /> :
                     step.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                     ''}
                  </div>
                  <span className={`text-sm ${step.status === 'running' ? 'text-white font-medium' : step.status === 'completed' ? 'text-green-400' : 'text-gray-400'}`}>
                    {step.message}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                initial={{ width: '5%' }}
                animate={{ width: `${getLatestProgress(jobStatus?.steps || [])}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {state.error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-sm">{state.error}</p>
                <button
                  onClick={() => setState((s) => ({ ...s, step: 'url', error: null, jobId: null }))}
                  className="mt-2 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  נסה שוב
                </button>
              </div>
            )}

            {/* Cancel button */}
            <button
              onClick={handleCancelScan}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-colors"
            >
              ביטול סריקה
            </button>
          </motion.div>
        )}

        {/* Step: Settings */}
        {state.step === 'settings' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="admin-card p-8">
            <h2 className="text-xl font-semibold text-white mb-2">הגדרות ווידג'ט</h2>
            <p className="text-gray-400 mb-6">התאימו את הצ'אטבוט לאתר שלכם</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">צבע ראשי</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={state.widgetColor}
                    onChange={(e) => setState((s) => ({ ...s, widgetColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-600 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={state.widgetColor}
                    onChange={(e) => setState((s) => ({ ...s, widgetColor: e.target.value }))}
                    className="admin-input flex-1"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">הודעת ברכה</label>
                <input
                  type="text"
                  value={state.welcomeMessage}
                  onChange={(e) => setState((s) => ({ ...s, welcomeMessage: e.target.value }))}
                  className="admin-input w-full"
                />
              </div>
            </div>

            <button
              onClick={() => setState((s) => ({ ...s, step: 'complete' }))}
              className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              <Check className="w-5 h-5" />
              סיום
            </button>
          </motion.div>
        )}

        {/* Step: Complete */}
        {state.step === 'complete' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="admin-card p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">האתר נסרק בהצלחה!</h2>
              <p className="text-gray-400 mb-6">הווידג'ט מוכן להטמעה באתר שלכם</p>

              {/* Scan results */}
              {jobStatus?.result && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-2xl font-bold text-white">{jobStatus.result.pagesScraped || 0}</p>
                    <p className="text-xs text-gray-400">דפים</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-2xl font-bold text-white">{formatNumber(jobStatus.result.totalWords || 0)}</p>
                    <p className="text-xs text-gray-400">מילים</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-2xl font-bold text-white">{jobStatus.result.totalImages || 0}</p>
                    <p className="text-xs text-gray-400">תמונות</p>
                  </div>
                </div>
              )}
            </div>

            {/* Embed Code */}
            <div className="admin-card p-6">
              <h3 className="text-lg font-semibold text-white mb-3">קוד הטמעה</h3>
              <p className="text-sm text-gray-400 mb-4">
                הדביקו את הקוד הזה לפני תגית {'</body>'} בכל דפי האתר שלכם
              </p>

              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-300 mb-4" dir="ltr">
                {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-account-id="${state.accountId}"></script>`}
              </div>

              <button
                onClick={handleCopyCode}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                {codeCopied ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    הועתק!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    העתק קוד
                  </>
                )}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Link
                href={`/admin/websites/${state.accountId}/preview`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                צפה בהדגמה
              </Link>
              <Link
                href="/admin/dashboard"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
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
