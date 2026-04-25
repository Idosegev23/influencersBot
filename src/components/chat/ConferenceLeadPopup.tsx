'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConferenceLeadPopupProps {
  accountId: string;
  sessionId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const SERVICES: { value: string; label: string; tagline: string }[] = [
  { value: 'NewVoices', label: 'סוכן קולי AI', tagline: 'NewVoices' },
  { value: 'Influencer Marketing AI', label: 'IMAI', tagline: 'פלטפורמת AI לשיווק משפיענים' },
  { value: 'Leaders Platform', label: 'Leaders Platform', tagline: 'בריף → הצעה → מצגת אוטומטית' },
  { value: 'AI Implementation', label: 'ליווי הטמעת AI', tagline: '5 שלבים מקצה לקצה' },
  { value: 'AI Automations', label: 'אוטומציות מותאמות', tagline: 'תהליכים שלמים' },
  { value: 'not_sure', label: 'עוד לא בטוח/ה', tagline: 'בואו נדבר ונבין יחד' },
];

export function ConferenceLeadPopup({
  accountId,
  sessionId,
  onClose,
  onSubmitted,
}: ConferenceLeadPopupProps) {
  const [step, setStep] = useState<'select' | 'details' | 'success'>('select');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string>('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    companyName: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(key: keyof typeof form, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) {
      setErrors((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  }

  function validate(): boolean {
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

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/leads/conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          sessionId: sessionId || undefined,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          companyName: form.companyName.trim() || undefined,
          preferredProduct: selectedService === 'not_sure' ? null : selectedService,
          primaryArea:
            selectedService === 'AI Implementation'
              ? 'implementation'
              : selectedService === 'NewVoices'
              ? 'voice_agent'
              : selectedService === 'AI Automations'
              ? 'automations'
              : selectedService === 'Influencer Marketing AI'
              ? 'influencer_ai'
              : selectedService === 'not_sure'
              ? 'consulting'
              : undefined,
          sourceParam: 'conf',
          utmSource: 'qr_code',
          utmMedium: 'conference',
          utmCampaign: 'innovation_conf_2026',
          landingUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          referrer: typeof document !== 'undefined' ? document.referrer : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          platform:
            typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
          locale: 'he-IL',
          botSummary: `Lead from conference popup after 3 messages. Selected service: ${selectedService}.`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'שליחה נכשלה');
      }

      setStep('success');
      try {
        sessionStorage.setItem('ldrs_conf_popup_submitted', '1');
      } catch {}
      setTimeout(() => {
        onSubmitted();
      }, 2400);
    } catch (err: any) {
      console.error('Conference popup submit error:', err);
      setError(err?.message || 'משהו השתבש. נסו שוב בעוד רגע.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClasses =
    'w-full px-4 py-3 rounded-xl text-sm bg-white border border-[#E0E0E0] text-black placeholder-[#999] focus:border-[#db2777] focus:ring-1 focus:ring-[#db2777] outline-none transition-colors';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl"
          style={{ direction: 'rtl' }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3 flex items-start gap-3 border-b border-[#F0F0F0]">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[#db2777]/10">
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ color: '#db2777' }}
              >
                {step === 'success' ? 'check_circle' : 'event'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-black leading-tight">
                {step === 'select' && 'איזה שירות הכי מעניין אתכם?'}
                {step === 'details' && 'נשמח לדבר 30 דקות'}
                {step === 'success' && 'קיבלנו! נחזור אליכם בקרוב'}
              </h3>
              <p className="text-xs text-[#666] mt-1">
                {step === 'select' && 'בחרו אחד ונקבע פגישה קצרה — בלי מחויבות'}
                {step === 'details' && 'פרטי קשר ונחזור אליכם תוך 48 שעות'}
                {step === 'success' && 'אחד מהצוות יחזור אליכם תוך 48 שעות'}
              </p>
            </div>
            {step !== 'success' && (
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-black/5 transition-colors flex-shrink-0"
                aria-label="סגור"
              >
                <span className="material-symbols-outlined text-[20px] text-[#999]">close</span>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-5 flex-1 overflow-y-auto">
            {step === 'select' && (
              <div className="space-y-2">
                {SERVICES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      setSelectedService(s.value);
                      setStep('details');
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#E0E0E0] hover:border-[#db2777] hover:bg-[#fdf2f8] transition-all text-right"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-black">{s.label}</div>
                      <div className="text-xs text-[#666] mt-0.5">{s.tagline}</div>
                    </div>
                    <span
                      className="material-symbols-outlined text-[18px] text-[#999] flex-shrink-0"
                    >
                      chevron_left
                    </span>
                  </button>
                ))}
              </div>
            )}

            {step === 'details' && (
              <div className="space-y-3">
                {selectedService && (
                  <div className="px-3 py-2 rounded-lg bg-[#fdf2f8] border border-[#fbcfe8] text-xs text-[#831843] flex items-center justify-between">
                    <span>
                      בחירה: <strong>{SERVICES.find((s) => s.value === selectedService)?.label}</strong>
                    </span>
                    <button
                      onClick={() => setStep('select')}
                      className="text-[#db2777] hover:underline text-xs font-medium"
                    >
                      שינוי
                    </button>
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    placeholder="שם מלא *"
                    value={form.fullName}
                    onChange={(e) => set('fullName', e.target.value)}
                    className={`${inputClasses} ${errors.fullName ? '!border-red-500' : ''}`}
                    autoFocus
                  />
                  {errors.fullName && (
                    <p className="text-red-500 text-[11px] mt-1 px-1">{errors.fullName}</p>
                  )}
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
                  {errors.phone && (
                    <p className="text-red-500 text-[11px] mt-1 px-1">{errors.phone}</p>
                  )}
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
                  {errors.email && (
                    <p className="text-red-500 text-[11px] mt-1 px-1">{errors.email}</p>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="חברה (אופציונלי)"
                  value={form.companyName}
                  onChange={(e) => set('companyName', e.target.value)}
                  className={inputClasses}
                />

                {error && (
                  <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                    {error}
                  </div>
                )}
              </div>
            )}

            {step === 'success' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center bg-[#db2777]">
                  <span
                    className="material-symbols-outlined text-[32px] text-white"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                </div>
                <h4 className="text-lg font-bold text-black mb-1">תודה!</h4>
                <p className="text-sm text-[#666]">נחזור אליכם תוך 48 שעות</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {step === 'details' && (
            <div className="px-5 py-3 border-t border-[#F0F0F0] flex gap-2">
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[#E0E0E0] text-[#666] hover:bg-[#F5F5F5] transition-colors"
              >
                חזרה
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                style={{ background: '#db2777' }}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>שולח...</span>
                  </>
                ) : (
                  'קבעו לי פגישה'
                )}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
