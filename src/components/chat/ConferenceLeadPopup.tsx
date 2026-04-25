'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle, ChevronLeft } from 'lucide-react';

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
  const [error, setError] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');

  function validate(): string {
    if (!fullName.trim()) return 'שם מלא נדרש';
    if (!phone.trim()) return 'מספר טלפון נדרש';
    if (!/^[\d\-+() ]{7,15}$/.test(phone.trim())) return 'מספר לא תקין';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'אימייל לא תקין';
    return '';
  }

  async function handleSubmit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/leads/conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          sessionId: sessionId || undefined,
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          companyName: companyName.trim() || undefined,
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
          botSummary: `Lead from conference popup after 3 messages. Service: ${selectedService}.`,
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
      setTimeout(() => onSubmitted(), 2400);
    } catch (err: any) {
      setError(err?.message || 'שגיאה בחיבור');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClasses =
    'w-full h-[50px] px-5 rounded-full text-[15px] outline-none transition-all focus:ring-2 focus:ring-black/10';
  const inputStyle = {
    backgroundColor: '#f4f5f7',
    color: '#0c1013',
    border: '1px solid #e5e5ea',
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[360px] rounded-[30px] p-7 relative"
          style={{ backgroundColor: '#ffffff' }}
        >
          {/* Close */}
          {step !== 'success' && (
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
              aria-label="סגור"
            >
              <X className="w-4 h-4" style={{ color: '#676767' }} />
            </button>
          )}

          {/* Step 1 — Service select */}
          {step === 'select' && (
            <>
              <div className="text-center mb-5 pt-2">
                <h3 className="text-[20px] font-bold mb-1" style={{ color: '#0c1013' }}>
                  איזה שירות הכי מעניין?
                </h3>
                <p className="text-[14px]" style={{ color: '#676767' }}>
                  בחרו אחד ונקבע פגישה קצרה
                </p>
              </div>

              <div className="space-y-2">
                {SERVICES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      setSelectedService(s.value);
                      setStep('details');
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all text-right hover:bg-[#f4f5f7]"
                    style={{ border: '1px solid #e5e5ea' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[14px] font-bold leading-tight"
                        style={{ color: '#0c1013' }}
                      >
                        {s.label}
                      </div>
                      <div
                        className="text-[12px] mt-0.5 truncate"
                        style={{ color: '#676767' }}
                      >
                        {s.tagline}
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#999' }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2 — Contact details */}
          {step === 'details' && (
            <>
              <div className="text-center mb-5 pt-2">
                <h3 className="text-[20px] font-bold mb-1" style={{ color: '#0c1013' }}>
                  קבעו לכם פגישה
                </h3>
                <p className="text-[14px]" style={{ color: '#676767' }}>
                  30 דקות, בלי מחויבות. נחזור תוך 48 שעות
                </p>
              </div>

              {selectedService && (
                <button
                  onClick={() => setStep('select')}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-full mb-3 hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: '#f4f5f7', border: '1px solid #e5e5ea' }}
                >
                  <span className="text-[13px]" style={{ color: '#676767' }}>
                    בחירה:{' '}
                    <strong style={{ color: '#0c1013' }}>
                      {SERVICES.find((s) => s.value === selectedService)?.label}
                    </strong>
                  </span>
                  <span
                    className="text-[12px] font-medium underline"
                    style={{ color: '#676767' }}
                  >
                    שינוי
                  </span>
                </button>
              )}

              <div className="space-y-3">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="שם מלא"
                  dir="rtl"
                  className={inputClasses}
                  style={inputStyle}
                  autoFocus
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="נייד"
                  dir="ltr"
                  className={`${inputClasses} text-right`}
                  style={inputStyle}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="מייל (אופציונלי)"
                  dir="ltr"
                  className={`${inputClasses} text-right`}
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="חברה (אופציונלי)"
                  dir="rtl"
                  className={inputClasses}
                  style={inputStyle}
                />
              </div>

              {error && (
                <p className="text-[13px] text-center mt-3" style={{ color: '#ff3b30' }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full h-[50px] rounded-full text-[16px] font-semibold mt-5 transition-all flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#0c1013', color: '#ffffff' }}
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'קבעו לי פגישה'
                )}
              </button>
            </>
          )}

          {/* Step 3 — Success */}
          {step === 'success' && (
            <div className="text-center py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <CheckCircle
                  className="w-14 h-14 mx-auto mb-4"
                  style={{ color: '#34c759' }}
                />
              </motion.div>
              <h3 className="text-[20px] font-bold mb-2" style={{ color: '#0c1013' }}>
                תודה, {fullName.trim().split(' ')[0]}!
              </h3>
              <p className="text-[14px]" style={{ color: '#676767' }}>
                נחזור אליכם תוך 48 שעות
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
