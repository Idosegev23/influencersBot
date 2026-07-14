'use client';

import { useEffect, useState } from 'react';
import { useDashboardLang } from '@/hooks/useDashboardLang';
import { getDashboardStrings, dashboardDir } from '@/lib/i18n/dashboard';

const BRAND = '#883fe2';

/**
 * First-run guided tour, shown once for a freshly-onboarded account. Self-gates via
 * GET /api/influencer/tutorial (only shows when onboarding is 'ready' and unseen);
 * dismiss POSTs tutorial_seen=true so it never shows again.
 */
export default function FirstRunTutorial({ username }: { username: string }) {
  const { lang } = useDashboardLang(username);
  const t = getDashboardStrings(lang).tutorial;
  const dir = dashboardDir(lang);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const steps = t.steps as ReadonlyArray<{ title: string; body: string }>;

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    fetch(`/api/influencer/tutorial?username=${username}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.show) setOpen(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username]);

  function dismiss() {
    setOpen(false);
    fetch(`/api/influencer/tutorial?username=${username}`, { method: 'POST' }).catch(() => {});
  }

  if (!open) return null;
  const last = step >= steps.length - 1;
  const cur = steps[step];

  return (
    <div dir={dir} style={{ direction: dir }} className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={dismiss}>
      <div className="absolute inset-0" style={{ background: 'rgba(10,8,18,0.72)', backdropFilter: 'blur(4px)' }} />
      <div className="relative w-full max-w-md rounded-3xl p-7 text-center" style={{ background: '#fff' }}
        onClick={(e) => e.stopPropagation()}>
        <button onClick={dismiss} className="absolute top-3 text-xs text-gray-400"
          style={{ [dir === 'rtl' ? 'left' : 'right']: '16px' } as React.CSSProperties}>
          {t.skip}
        </button>

        <div className="text-4xl mb-3">{['🎉', '📊', '💬', '📈'][step] || '✨'}</div>
        <h2 className="text-xl font-extrabold text-gray-900">{cur.title}</h2>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">{cur.body}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-6 mb-6">
          {steps.map((_, i) => (
            <span key={i} className="rounded-full transition-all" style={{
              width: i === step ? 20 : 7, height: 7,
              background: i === step ? BRAND : '#e5e7eb',
            }} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 disabled:opacity-0"
          >
            {t.back}
          </button>
          <button
            onClick={() => (last ? dismiss() : setStep((s) => s + 1))}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: BRAND }}
          >
            {last ? t.finish : t.next}
          </button>
        </div>
      </div>
    </div>
  );
}
