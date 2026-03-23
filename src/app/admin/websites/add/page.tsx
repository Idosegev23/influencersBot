'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';

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

const COLOR_PRESETS = [
  { name: 'mint', value: '#9334EB' },
  { name: 'lavender', value: '#2663EB' },
  { name: 'pink', value: '#DC2627' },
  { name: 'gold', value: '#FFD700' },
  { name: 'lime', value: '#BFFF00' },
];

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
    widgetColor: '#9334EB',
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
    const snippet = `<!-- bestieAI Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${state.accountId}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center py-32" dir="rtl">
        <div className="w-10 h-10 rounded-full border-3 border-[#2663EB] border-t-transparent animate-spin" />
      </div>
    );
  }

  const steps: { key: WizardStep; label: string; icon: string }[] = [
    { key: 'url', label: 'כתובת', icon: 'language' },
    { key: 'scraping', label: 'סריקה', icon: 'radar' },
    { key: 'settings', label: 'הגדרות', icon: 'palette' },
    { key: 'complete', label: 'סיום', icon: 'celebration' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === state.step);

  return (
    <>
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/admin/dashboard"
          className="neon-pill neon-pill-outline inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          חזרה
        </Link>
      </div>

      {/* Page title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#1f2937] font-headline">הוספת אתר חדש</h1>
        <p className="text-sm text-[#4b5563] mt-1">סרקו, התאימו והטמיעו צ&apos;אטבוט חכם באתר שלכם</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 mb-10">
        {steps.map((s, i) => {
          const isDone = i < currentStepIndex;
          const isCurrent = i === currentStepIndex;

          return (
            <div key={s.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <motion.div
                  className={`rounded-full flex items-center justify-center transition-all duration-300 ${
                    isDone
                      ? 'w-10 h-10 bg-[#9334EB] text-[#1A1C1E] shadow-[0_4px_16px_rgba(23,163,74,0.2)]'
                      : isCurrent
                      ? 'w-12 h-12 bg-[#2663EB] text-white ring-4 ring-white shadow-[0_4px_20px_rgba(147,52,235,0.35)] scale-110'
                      : 'w-10 h-10 bg-transparent border-2 border-[#d1d5db] text-[#d1d5db]'
                  }`}
                  animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                >
                  {isDone ? (
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">{s.icon}</span>
                  )}
                </motion.div>
                <span className={`text-xs mt-2 font-medium ${
                  isDone ? 'text-[#9334EB]' : isCurrent ? 'text-[#2663EB] font-bold' : 'text-[#d1d5db]'
                }`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-3 mt-[-1.25rem]">
                  <div
                    className="w-12 h-[3px] rounded-full transition-colors duration-500"
                    style={{
                      background: isDone
                        ? 'linear-gradient(to left, #9334EB, #2663EB)'
                        : '#e8e0d6',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Content area — max-width centered */}
      <div className="max-w-xl mx-auto">

        {/* Step: URL Input */}
        {state.step === 'url' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
            {/* Decorative blur glow */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#2663EB]/15 rounded-full blur-3xl pointer-events-none" />

            <div className="neon-card p-8 relative">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-[#DC2627]/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#DC2627] text-[24px]">brush</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1f2937] font-headline">הזינו את כתובת האתר</h2>
                  <p className="text-sm text-[#4b5563]">נסרוק את כל דפי האתר ונאנדקס את התוכן לצ&apos;אטבוט חכם</p>
                </div>
              </div>

              <input
                type="url"
                placeholder="https://example.com"
                value={state.url}
                onChange={(e) => setState((s) => ({ ...s, url: e.target.value, error: null }))}
                onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
                className={`neon-input text-lg mb-4 ${state.error ? '!shadow-[0_0_0_2px_rgba(220,38,39,0.3)] !bg-[#DC2627]/[0.03]' : ''}`}
                dir="ltr"
                autoFocus
              />

              {state.error && (
                <div className="flex items-center gap-2 mb-4 px-1">
                  <span className="material-symbols-outlined text-[#DC2627] text-[16px]">error</span>
                  <p className="text-sm text-[#DC2627]">{state.error}</p>
                </div>
              )}

              <button
                onClick={handleStartScan}
                disabled={state.isLoading || !state.url.trim()}
                className="neon-pill neon-pill-primary w-full justify-center py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: state.isLoading ? '#9334EB' : 'linear-gradient(135deg, #9334EB, #2663EB)' }}
              >
                {state.isLoading ? (
                  <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">bolt</span>
                )}
                {state.isLoading ? 'מתחיל...' : 'התחל סריקה'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step: Scraping */}
        {state.step === 'scraping' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#9334EB]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="neon-card p-8 relative">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-[#2663EB]/15 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#2663EB] text-[24px] animate-spin" style={{ animationDuration: '3s' }}>radar</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1f2937] font-headline">סורקים את האתר...</h2>
                  <p className="text-sm text-[#4b5563]">התהליך עשוי לקחת כמה דקות. אל תסגרו את הדף.</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {deduplicateSteps(jobStatus?.steps || []).map((step: any, i: number) => (
                  <div key={step.step || i} className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        step.status === 'completed'
                          ? 'bg-[#9334EB]/15'
                          : step.status === 'running'
                          ? 'bg-[#2663EB]/15'
                          : step.status === 'failed'
                          ? 'bg-[#DC2627]/10'
                          : 'bg-[#f3f4f6]'
                      }`}
                    >
                      {step.status === 'completed' ? (
                        <span className="material-symbols-outlined text-[#9334EB] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      ) : step.status === 'running' ? (
                        <span className="material-symbols-outlined text-[#2663EB] text-[16px] animate-spin">progress_activity</span>
                      ) : step.status === 'failed' ? (
                        <span className="material-symbols-outlined text-[#DC2627] text-[16px]">cancel</span>
                      ) : (
                        <span className="material-symbols-outlined text-[#d1d5db] text-[16px]">radio_button_unchecked</span>
                      )}
                    </div>
                    <span className={`text-sm ${
                      step.status === 'running' ? 'text-[#1f2937] font-medium' :
                      step.status === 'completed' ? 'text-[#4b5563]' :
                      step.status === 'failed' ? 'text-[#DC2627]' :
                      'text-[#d1d5db]'
                    }`}>
                      {step.message}
                    </span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full overflow-hidden bg-[#f3f4f6]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(to left, #2663EB, #9334EB)' }}
                  initial={{ width: '5%' }}
                  animate={{ width: `${getLatestProgress(jobStatus?.steps || [])}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              {state.error && (
                <div className="mt-4 p-4 rounded-2xl bg-[#DC2627]/[0.04] border border-[#DC2627]/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#DC2627] text-[18px]">warning</span>
                    <p className="text-sm text-[#DC2627]">{state.error}</p>
                  </div>
                  <button
                    onClick={() => setState((s) => ({ ...s, step: 'url', error: null, jobId: null }))}
                    className="mt-2 text-sm text-[#2663EB] font-medium hover:underline"
                  >
                    נסה שוב
                  </button>
                </div>
              )}

              <button
                onClick={handleCancelScan}
                className="neon-pill neon-pill-danger w-full justify-center mt-5"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
                ביטול סריקה
              </button>
            </div>
          </motion.div>
        )}

        {/* Step: Settings */}
        {state.step === 'settings' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#2663EB]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="neon-card p-8 relative">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-[#2663EB]/15 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#2663EB] text-[24px]">palette</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1f2937] font-headline">הגדרות ווידג&apos;ט</h2>
                  <p className="text-sm text-[#4b5563]">התאימו את הצ&apos;אטבוט לאתר שלכם</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Color picker */}
                <div>
                  <label className="block text-sm font-medium text-[#4b5563] mb-3">צבע ראשי</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setState((s) => ({ ...s, widgetColor: c.value }))}
                        className={`w-9 h-9 rounded-full transition-all duration-200 ${
                          state.widgetColor === c.value
                            ? 'ring-2 ring-offset-2 ring-[#1f2937] scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{ background: c.value }}
                      >
                        {state.widgetColor === c.value && (
                          <span className="material-symbols-outlined text-white text-[16px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                        )}
                      </button>
                    ))}
                    {/* Custom color picker */}
                    <div className="relative">
                      <input
                        type="color"
                        value={state.widgetColor}
                        onChange={(e) => setState((s) => ({ ...s, widgetColor: e.target.value }))}
                        className="w-9 h-9 rounded-full cursor-pointer border-2 border-dashed border-[#d1d5db] bg-transparent appearance-none"
                        style={{ WebkitAppearance: 'none' }}
                        title="בחר צבע מותאם"
                      />
                      <span className="material-symbols-outlined text-[#d1d5db] text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">add</span>
                    </div>
                  </div>
                </div>

                {/* Welcome message */}
                <div>
                  <label className="block text-sm font-medium text-[#4b5563] mb-2">הודעת ברכה</label>
                  <textarea
                    value={state.welcomeMessage}
                    onChange={(e) => setState((s) => ({ ...s, welcomeMessage: e.target.value }))}
                    className="neon-input !rounded-2xl resize-none"
                    rows={3}
                  />
                </div>

                {/* Phone preview */}
                <div>
                  <label className="block text-sm font-medium text-[#4b5563] mb-3">תצוגה מקדימה</label>
                  <div className="flex justify-center">
                    <div className="relative w-[160px] h-[320px] rounded-[24px] bg-slate-900 p-[6px] shadow-xl">
                      {/* Phone notch */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 bg-slate-900 rounded-b-xl z-10" />
                      {/* Screen */}
                      <div className="w-full h-full rounded-[20px] bg-white overflow-hidden flex flex-col">
                        {/* Header bar */}
                        <div className="h-10 flex items-center justify-center" style={{ background: state.widgetColor }}>
                          <span className="text-white text-[10px] font-bold">הצ&apos;אטבוט שלכם</span>
                        </div>
                        {/* Chat area */}
                        <div className="flex-1 p-3 flex flex-col justify-end gap-2">
                          <div className="self-start max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-[8px] text-white leading-tight" style={{ background: state.widgetColor }}>
                            {state.welcomeMessage}
                          </div>
                          <div className="self-end max-w-[75%] rounded-xl rounded-bl-sm px-3 py-2 bg-[#f3f4f6] text-[8px] text-[#1f2937] leading-tight">
                            היי, יש לי שאלה...
                          </div>
                        </div>
                        {/* Input bar */}
                        <div className="h-8 border-t border-gray-100 flex items-center px-2 gap-1">
                          <div className="flex-1 h-5 bg-[#f3f4f6] rounded-full" />
                          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: state.widgetColor }}>
                            <span className="material-symbols-outlined text-white text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                          </div>
                        </div>
                      </div>
                      {/* FAB */}
                      <div className="absolute -bottom-3 -left-3 w-11 h-11 rounded-full shadow-lg flex items-center justify-center" style={{ background: state.widgetColor }}>
                        <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat_bubble</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
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
                className="neon-pill neon-pill-primary w-full justify-center py-3 text-base font-semibold mt-6 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #9334EB, #2663EB)' }}
              >
                {state.isLoading ? (
                  <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                )}
                {state.isLoading ? 'שומר...' : 'המשך לסיום'}
              </button>

              <button
                onClick={() => setState((s) => ({ ...s, step: 'complete', isLoading: false }))}
                className="w-full text-center text-sm text-[#d1d5db] hover:text-[#4b5563] transition-colors mt-3 py-2"
              >
                דילוג על שלב זה
              </button>
            </div>
          </motion.div>
        )}

        {/* Step: Complete */}
        {state.step === 'complete' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Success card */}
            <div className="neon-card p-8 text-center relative overflow-hidden">
              {/* Decorative glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#9334EB]/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-[#9334EB]/15 flex items-center justify-center mx-auto mb-4 shadow-[0_4px_20px_rgba(23,163,74,0.15)]">
                  <span className="material-symbols-outlined text-[#9334EB] text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                </div>
                <h2 className="text-xl font-bold text-[#1f2937] font-headline mb-1">האתר נסרק בהצלחה!</h2>
                <p className="text-sm text-[#4b5563] mb-6">הווידג&apos;ט מוכן להטמעה באתר שלכם</p>

                {/* Scan results */}
                {jobStatus?.result && (
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <div className="rounded-2xl p-4 bg-[#f3f4f6]">
                      <p className="text-2xl font-bold text-[#1f2937]">{jobStatus.result.pagesScraped || 0}</p>
                      <p className="text-xs text-[#d1d5db] mt-1">דפים</p>
                    </div>
                    <div className="rounded-2xl p-4 bg-[#f3f4f6]">
                      <p className="text-2xl font-bold text-[#1f2937]">{formatNumber(jobStatus.result.totalWords || 0)}</p>
                      <p className="text-xs text-[#d1d5db] mt-1">מילים</p>
                    </div>
                    <div className="rounded-2xl p-4 bg-[#f3f4f6]">
                      <p className="text-2xl font-bold text-[#1f2937]">{jobStatus.result.totalImages || 0}</p>
                      <p className="text-xs text-[#d1d5db] mt-1">תמונות</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Embed Code */}
            <div className="neon-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#2663EB] text-[22px]">code</span>
                <h3 className="text-lg font-bold text-[#1f2937] font-headline">קוד הטמעה</h3>
              </div>
              <p className="text-sm text-[#4b5563] mb-4">
                הדביקו את הקוד הזה לפני תגית {'</body>'} בכל דפי האתר שלכם
              </p>

              <div className="rounded-2xl p-4 font-mono text-sm bg-[#f3f4f6] text-[#1f2937] break-all leading-relaxed" dir="ltr">
                {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-account-id="${state.accountId}"></script>`}
              </div>

              <button
                onClick={handleCopyCode}
                className="neon-pill neon-pill-ghost w-full justify-center mt-4"
              >
                {codeCopied ? (
                  <>
                    <span className="material-symbols-outlined text-[#9334EB] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    הועתק!
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">content_copy</span>
                    העתק קוד
                  </>
                )}
              </button>
            </div>

            {/* Management Link */}
            {manageToken && (
              <div className="neon-card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="material-symbols-outlined text-[#DC2627] text-[22px]">link</span>
                  <h3 className="text-lg font-bold text-[#1f2937] font-headline">לינק ניהול ללקוח</h3>
                </div>
                <p className="text-sm text-[#4b5563] mb-4">
                  שלחו את הלינק הזה לבעל האתר — הוא יוכל לנהל הנחיות, שאלות נפוצות וידע
                </p>
                <div className="rounded-2xl p-4 font-mono text-sm bg-[#f3f4f6] text-[#1f2937] break-all leading-relaxed" dir="ltr">
                  {typeof window !== 'undefined' ? `${window.location.origin}/manage/${manageToken}` : ''}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/manage/${manageToken}`);
                    setManageLinkCopied(true);
                    setTimeout(() => setManageLinkCopied(false), 2000);
                  }}
                  className="neon-pill neon-pill-ghost w-full justify-center mt-4"
                >
                  {manageLinkCopied ? (
                    <>
                      <span className="material-symbols-outlined text-[#9334EB] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                      הועתק!
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">content_copy</span>
                      העתק לינק ניהול
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Link
                href={`/admin/websites/${state.accountId}/preview`}
                className="neon-pill neon-pill-primary flex-1 justify-center py-3"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                צפה בהדגמה
              </Link>
              <Link
                href="/admin/dashboard"
                className="neon-pill neon-pill-outline flex-1 justify-center py-3"
              >
                חזרה לדשבורד
              </Link>
            </div>

            {/* Footer security note */}
            <div className="flex items-center justify-center gap-2 py-4">
              <span className="material-symbols-outlined text-[#d1d5db] text-[16px]">shield</span>
              <p className="text-xs text-[#d1d5db]">כל הנתונים מוצפנים ומאובטחים</p>
            </div>
          </motion.div>
        )}
      </div>
    </>
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
