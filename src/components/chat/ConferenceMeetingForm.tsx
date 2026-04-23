'use client';

import { useState } from 'react';

interface ConferenceMeetingFormProps {
  accountId: string;
  sessionId?: string | null;
  serviceName?: string;
  onSubmitted: (data: Record<string, string>) => void;
  onCancel: () => void;
}

const PRIMARY_AREAS: { value: string; label: string }[] = [
  { value: 'implementation', label: 'הטמעת AI בארגון' },
  { value: 'voice_agent', label: 'סוכן קולי (NewVoices)' },
  { value: 'automations', label: 'אוטומציות מותאמות' },
  { value: 'influencer_ai', label: 'פלטפורמת IMAI' },
  { value: 'consulting', label: 'ייעוץ / לא בטוח עדיין' },
];

const AI_USAGE: { value: string; label: string; aiInOrg: boolean }[] = [
  { value: 'none', label: 'אין אצלנו AI', aiInOrg: false },
  { value: 'personal', label: 'חשבונות פרטיים של עובדים', aiInOrg: false },
  { value: 'pilot', label: 'שימוש ראשוני / פיילוט', aiInOrg: false },
  { value: 'organizational', label: 'AI ארגוני פעיל', aiInOrg: true },
];

const TIMELINES: { value: string; label: string; months: number | null }[] = [
  { value: 'now', label: 'מתחילים עכשיו', months: 1 },
  { value: 'quarter', label: 'ברבעון הקרוב', months: 3 },
  { value: 'year', label: 'בשנה הקרובה', months: 9 },
  { value: 'exploring', label: 'רק בודקים', months: null },
];

export default function ConferenceMeetingForm({
  accountId,
  sessionId,
  serviceName,
  onSubmitted,
  onCancel,
}: ConferenceMeetingFormProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    companyName: '',
    role: '',
    primaryArea: serviceName ? 'implementation' : '',
    currentAiUsage: '',
    painPoint: '',
    readiness: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof form, val: string) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) {
      setErrors((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  };

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'שדה חובה';
    if (!form.phone.trim()) e.phone = 'שדה חובה';
    else if (!/^[\d\-+() ]{7,15}$/.test(form.phone.trim())) e.phone = 'מספר לא תקין';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'אימייל לא תקין';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validateStep1()) setStep(2);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const usage = AI_USAGE.find((u) => u.value === form.currentAiUsage);
    const timeline = TIMELINES.find((t) => t.value === form.readiness);

    try {
      const res = await fetch('/api/leads/conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          sessionId,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          companyName: form.companyName.trim() || undefined,
          role: form.role.trim() || undefined,
          primaryArea: form.primaryArea || undefined,
          currentAiUsage: usage?.label || form.currentAiUsage || undefined,
          painPoint: form.painPoint.trim() || undefined,
          readiness: timeline?.label || form.readiness || undefined,
          preferredProduct: serviceName || undefined,
          aiInOrg: usage ? usage.aiInOrg : undefined,
          hasDefinedPain: !!form.painPoint.trim(),
          timelineMonths: timeline?.months ?? undefined,
          sourceParam: 'conf',
          utmSource: 'qr_code',
          utmMedium: 'conference',
          utmCampaign: 'innovation_conf_2026',
          landingUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          referrer: typeof document !== 'undefined' ? document.referrer : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          platform:
            typeof window !== 'undefined'
              ? window.innerWidth < 768
                ? 'mobile'
                : 'desktop'
              : undefined,
          locale: 'he-IL',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'שליחה נכשלה');
      }

      onSubmitted(form as unknown as Record<string, string>);
    } catch (err: any) {
      console.error('Conference form submit error:', err);
      setError(err?.message || 'משהו השתבש. נסו שוב בעוד רגע.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClasses =
    'w-full px-4 py-3 rounded-xl text-sm bg-[#0a1433] border border-[#1E2B52] text-white placeholder-[#5E6E94] focus:border-[#5FD4F5] focus:ring-1 focus:ring-[#5FD4F5] outline-none transition-colors';

  return (
    <div className="flex flex-col h-full" style={{ direction: 'rtl' }}>
      <div className="flex items-center gap-2 mb-5 px-1">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                background: step >= s ? '#5FD4F5' : '#1E2B52',
                color: step >= s ? '#061021' : '#5E6E94',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: step >= s ? '#ffffff' : '#5E6E94' }}
            >
              {s === 1 ? 'פרטים' : 'הקשר'}
            </span>
            {s < 2 && (
              <div
                className="flex-1 h-0.5 rounded"
                style={{ background: step > s ? '#5FD4F5' : '#1E2B52' }}
              />
            )}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-3 flex-1">
          <div>
            <input
              type="text"
              placeholder="שם מלא *"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              className={`${inputClasses} ${errors.fullName ? '!border-red-500' : ''}`}
              autoFocus
            />
            {errors.fullName && <p className="text-red-400 text-[11px] mt-1 px-1">{errors.fullName}</p>}
          </div>
          <div>
            <input
              type="tel"
              placeholder="טלפון *"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={`${inputClasses} ${errors.phone ? '!border-red-500' : ''}`}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
            {errors.phone && <p className="text-red-400 text-[11px] mt-1 px-1">{errors.phone}</p>}
          </div>
          <div>
            <input
              type="email"
              placeholder="מייל"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={`${inputClasses} ${errors.email ? '!border-red-500' : ''}`}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
            {errors.email && <p className="text-red-400 text-[11px] mt-1 px-1">{errors.email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="חברה"
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              className={inputClasses}
            />
            <input
              type="text"
              placeholder="תפקיד"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 flex-1 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          <div>
            <label className="block text-xs font-semibold mb-2 text-[#9BA8C4]">
              איזה תחום הכי רלוונטי?
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_AREAS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => set('primaryArea', form.primaryArea === a.value ? '' : a.value)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.primaryArea === a.value ? '#5FD4F5' : '#1E2B52',
                    background: form.primaryArea === a.value ? '#5FD4F5' : 'transparent',
                    color: form.primaryArea === a.value ? '#061021' : '#9BA8C4',
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 text-[#9BA8C4]">
              איפה אתם היום עם AI?
            </label>
            <div className="flex flex-wrap gap-2">
              {AI_USAGE.map((u) => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => set('currentAiUsage', form.currentAiUsage === u.value ? '' : u.value)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.currentAiUsage === u.value ? '#5FD4F5' : '#1E2B52',
                    background: form.currentAiUsage === u.value ? '#5FD4F5' : 'transparent',
                    color: form.currentAiUsage === u.value ? '#061021' : '#9BA8C4',
                  }}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 text-[#9BA8C4]">
              מתי רוצים להתחיל?
            </label>
            <div className="flex flex-wrap gap-2">
              {TIMELINES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('readiness', form.readiness === t.value ? '' : t.value)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.readiness === t.value ? '#5FD4F5' : '#1E2B52',
                    background: form.readiness === t.value ? '#5FD4F5' : 'transparent',
                    color: form.readiness === t.value ? '#061021' : '#9BA8C4',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            placeholder="מה הכאב / צוואר הבקבוק העיקרי שלכם? (אופציונלי — בלי באזוורדס)"
            value={form.painPoint}
            onChange={(e) => set('painPoint', e.target.value)}
            rows={3}
            className={`${inputClasses} resize-none`}
          />

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-4 pt-3 border-t border-[#1E2B52]">
        {step === 1 ? (
          <>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#1E2B52] text-[#9BA8C4] hover:bg-[#0a1433] transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleNext}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors"
              style={{ background: '#5FD4F5', color: '#061021' }}
            >
              המשך →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#1E2B52] text-[#9BA8C4] hover:bg-[#0a1433] transition-colors"
            >
              ← חזרה
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              style={{ background: '#5FD4F5', color: '#061021' }}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#061021] border-t-transparent rounded-full animate-spin" />
                  <span>שולח...</span>
                </>
              ) : (
                'קבעו לי פגישה'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
