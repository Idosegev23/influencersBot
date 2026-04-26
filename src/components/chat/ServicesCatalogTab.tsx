'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Mic,
  Network,
  LayoutDashboard,
  Workflow,
  Zap,
  PenLine,
  TrendingUp,
  Megaphone,
  Video,
  Radio,
  BarChart3,
  Hash,
  Tv,
  Star,
  MessageCircle,
  FileText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Service {
  id: string;
  name: string;
  name_he?: string | null;
  description: string;
  category: string;
  subcategory?: string | null;
  product_line?: string | null;
  product_url?: string;
  priority?: number | null;
  is_available?: boolean;
}

interface ServicesCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string, hiddenContext?: string) => void;
  sessionId?: string | null;
  enableBrief?: boolean;
  /** When true, forces the Figma card grid (used by conference visitors). */
  bentoMode?: boolean;
}

// ---------------------------------------------------------------------------
// Icon mapping — lucide-react (desktop modal + train-track fallback)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  NewVoices: Mic,
  'Influencer Marketing AI': Network,
  'Leaders Platform': LayoutDashboard,
  'AI Implementation': Workflow,
  'AI Automations': Zap,
  'Content Creation': PenLine,
  SEO: TrendingUp,
  'Paid Social Advertising': Megaphone,
  'Video Production': Video,
  'Podcast Production': Radio,
  'Performance Marketing / PPC': BarChart3,
  'Social Media Management': Hash,
  'Television Advertising': Tv,
  'Influencer Marketing': Star,
};

const resolveIcon = (name: string): LucideIcon => ICON_MAP[name] || Sparkles;

// Figma SVG icons (white-stroke, sit inside dark tile) — mobile grid
const FIGMA_ICON_MAP: Record<string, string> = {
  NewVoices: '/icons/services/bonus-alt.svg',
  'Influencer Marketing AI': '/icons/services/status-up.svg',
  'AI Implementation': '/icons/services/lamp-on.svg',
  'AI Automations': '/icons/services/refresh-circle.svg',
  'Content Creation': '/icons/services/note.svg',
  'Influencer Marketing': '/icons/services/instagram.svg',
  'Paid Social Advertising': '/icons/services/instagram.svg',
  'Performance Marketing / PPC': '/icons/services/status-up.svg',
  'Podcast Production': '/icons/services/microphone.svg',
  SEO: '/icons/services/status-up.svg',
  'Social Media Management': '/icons/services/instagram.svg',
  'Television Advertising': '/icons/services/monitor.svg',
  'Video Production': '/icons/services/video.svg',
};

const resolveFigmaIcon = (name: string): string =>
  FIGMA_ICON_MAP[name] || '/icons/services/lamp-on.svg';

const isAIService = (svc: Service): boolean =>
  svc.subcategory === 'ai' ||
  svc.product_line === 'ai' ||
  !!svc.name.match(/\b(AI|NewVoices|IMAI|Leaders Platform)\b/i);

// ---------------------------------------------------------------------------
// MiniBriefForm
// ---------------------------------------------------------------------------

const GOALS = ['מודעות למותג', 'הגדלת מכירות', 'חדירה לשוק חדש', 'בניית קהילה', 'אחר'];
const BUDGETS = ['עד ₪5,000', '₪5,000 – ₪15,000', '₪15,000 – ₪50,000', '₪50,000+', 'לא בטוח/ה'];

function MiniBriefForm({
  service,
  accountId,
  sessionId,
  onSubmitted,
  onCancel,
}: {
  service: Service;
  accountId: string;
  sessionId?: string | null;
  onSubmitted: (briefData: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    businessName: '',
    email: '',
    phone: '',
    productDescription: '',
    goal: '',
    budgetRange: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, val: string) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) {
      setErrors((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'שדה חובה';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'אימייל לא תקין';
    if (form.phone.trim() && !/^[\d\-+() ]{7,15}$/.test(form.phone.trim())) e.phone = 'מספר לא תקין';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    const isConferenceVisitor =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('source') === 'conf';

    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          serviceId: service.id,
          serviceName: service.name,
          fullName: form.fullName.trim(),
          businessName: form.businessName.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          productDescription: form.productDescription.trim() || undefined,
          goal: form.goal || undefined,
          budgetRange: form.budgetRange || undefined,
          notes: form.notes.trim() || undefined,
          sessionId: sessionId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (isConferenceVisitor) {
          fetch('/api/leads/conference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId,
              sessionId: sessionId || undefined,
              fullName: form.fullName.trim(),
              phone: form.phone.trim(),
              email: form.email.trim() || undefined,
              companyName: form.businessName.trim() || undefined,
              painPoint: form.productDescription.trim() || undefined,
              primaryArea: form.goal || undefined,
              readiness: form.budgetRange || undefined,
              preferredProduct: service.name,
              hasDefinedPain: !!form.productDescription.trim(),
              sourceParam: 'conf',
              utmSource: 'qr_code',
              utmMedium: 'conference',
              utmCampaign: 'innovation_conf_2026',
              landingUrl: window.location.href,
              referrer: document.referrer || undefined,
              userAgent: navigator.userAgent,
              platform: window.innerWidth < 768 ? 'mobile' : 'desktop',
              locale: 'he-IL',
            }),
          }).catch((err) => console.error('Conference webhook mirror failed:', err));
        }
        onSubmitted(form);
      }
    } catch (err) {
      console.error('Brief submit error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClasses =
    'w-full h-[48px] px-4 rounded-xl text-[15px] outline-none transition-all focus:ring-2 focus:ring-zinc-900/10';
  const inputStyle = {
    backgroundColor: '#fafafa',
    color: '#09090b',
    border: '1px solid #e4e4e7',
  };

  return (
    <div className="flex flex-col h-full" style={{ direction: 'rtl' }}>
      <div className="flex items-center gap-2 mb-5 px-1">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
              style={{
                background: step >= s ? '#09090b' : '#e4e4e7',
                color: step >= s ? '#fff' : '#71717a',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span
              className="text-[12px] font-medium"
              style={{ color: step >= s ? '#09090b' : '#a1a1aa' }}
            >
              {s === 1 ? 'פרטים' : 'על הפרויקט'}
            </span>
            {s < 2 && (
              <div
                className="flex-1 h-px transition-colors"
                style={{ background: step > s ? '#09090b' : '#e4e4e7' }}
              />
            )}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-2.5 flex-1">
          <div>
            <input
              type="text"
              placeholder="שם מלא *"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              className={`${inputClasses} ${errors.fullName ? '!border-red-500' : ''}`}
              style={inputStyle}
              autoFocus
            />
            {errors.fullName && (
              <p className="text-red-500 text-[11px] mt-1 px-3">{errors.fullName}</p>
            )}
          </div>
          <input
            type="text"
            placeholder="שם העסק"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            className={inputClasses}
            style={inputStyle}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="email"
              placeholder="אימייל"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={`${inputClasses} ${errors.email ? '!border-red-500' : ''}`}
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
            />
            <input
              type="tel"
              placeholder="טלפון"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={`${inputClasses} ${errors.phone ? '!border-red-500' : ''}`}
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          <textarea
            placeholder="ספר/י בקצרה על המוצר או השירות"
            value={form.productDescription}
            onChange={(e) => set('productDescription', e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl text-[15px] outline-none transition-all focus:ring-2 focus:ring-zinc-900/10 resize-none"
            style={inputStyle}
          />
          <div>
            <label className="block text-[12px] font-medium mb-2 px-1" style={{ color: '#52525b' }}>
              מטרה
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('goal', form.goal === g ? '' : g)}
                  className="px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all"
                  style={{
                    borderColor: form.goal === g ? '#09090b' : '#e4e4e7',
                    background: form.goal === g ? '#09090b' : '#fff',
                    color: form.goal === g ? '#fff' : '#52525b',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-2 px-1" style={{ color: '#52525b' }}>
              תקציב
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('budgetRange', form.budgetRange === b ? '' : b)}
                  className="px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all"
                  style={{
                    borderColor: form.budgetRange === b ? '#09090b' : '#e4e4e7',
                    background: form.budgetRange === b ? '#09090b' : '#fff',
                    color: form.budgetRange === b ? '#fff' : '#52525b',
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-5 pt-3" style={{ borderTop: '1px solid #f4f4f5' }}>
        {step === 1 ? (
          <>
            <button
              onClick={onCancel}
              className="px-5 h-[44px] rounded-xl text-[14px] font-medium transition-colors hover:bg-zinc-50"
              style={{ border: '1px solid #e4e4e7', color: '#52525b' }}
            >
              ביטול
            </button>
            <button
              onClick={() => validate() && setStep(2)}
              className="flex-1 h-[44px] rounded-xl text-[14px] font-semibold text-white transition-all hover:opacity-90"
              style={{ background: '#09090b' }}
            >
              המשך
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="px-5 h-[44px] rounded-xl text-[14px] font-medium transition-colors hover:bg-zinc-50"
              style={{ border: '1px solid #e4e4e7', color: '#52525b' }}
            >
              חזרה
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-[44px] rounded-xl text-[14px] font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: '#09090b' }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שליחה'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Modal — agency clean
// ---------------------------------------------------------------------------

function ServiceModal({
  service,
  accountId,
  sessionId,
  enableBrief,
  onClose,
  onAskAbout,
}: {
  service: Service;
  accountId: string;
  sessionId?: string | null;
  enableBrief?: boolean;
  onClose: () => void;
  onAskAbout: (question: string, hiddenContext?: string) => void;
}) {
  const [showBrief, setShowBrief] = useState(false);
  const [briefSubmitted, setBriefSubmitted] = useState(false);
  const Icon = resolveIcon(service.name);
  const ai = isAIService(service);
  const displayName = service.name_he || service.name;

  const handleAsk = () => {
    onAskAbout(
      `ספרו לי על ${displayName}`,
      `[הקשר השירות:]\nשם: ${service.name}${service.name_he ? ` (${service.name_he})` : ''}\nתיאור: ${service.description}`
    );
    onClose();
  };

  const handleSubmitted = (form: Record<string, string>) => {
    setBriefSubmitted(true);
    setTimeout(() => {
      onAskAbout(
        `שלחתי בריף לגבי ${displayName}`,
        `[בריף שנשלח:]\nשירות: ${displayName}\nשם: ${form.fullName}${
          form.businessName ? `\nעסק: ${form.businessName}` : ''
        }${form.goal ? `\nמטרה: ${form.goal}` : ''}${
          form.budgetRange ? `\nתקציב: ${form.budgetRange}` : ''
        }`
      );
      onClose();
    }, 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full sm:max-w-md max-h-[88vh] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          style={{ direction: 'rtl', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.18)' }}
        >
          {/* Top bar with close */}
          <div className="flex items-center justify-end px-5 pt-4 pb-1">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-zinc-100"
              aria-label="סגור"
            >
              <X className="w-4 h-4" style={{ color: '#71717a' }} />
            </button>
          </div>

          {/* Hero */}
          <div className="px-6 pb-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: ai ? '#fdf2f8' : '#fafafa',
                border: ai ? '1px solid #fbcfe8' : '1px solid #e4e4e7',
              }}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: ai ? '#db2777' : '#09090b' }}
                strokeWidth={1.75}
              />
            </div>
            {ai && (
              <span
                className="inline-block text-[10px] font-semibold tracking-wider uppercase mb-2"
                style={{ color: '#db2777' }}
              >
                AI · LDRS
              </span>
            )}
            <h3 className="text-[20px] font-bold leading-tight" style={{ color: '#09090b' }}>
              {displayName}
            </h3>
            <p
              className="text-[14px] mt-2 leading-relaxed"
              style={{ color: '#52525b' }}
            >
              {service.description}
            </p>
          </div>

          {/* Body */}
          <div className="px-6 pb-6 flex-1 overflow-y-auto">
            {briefSubmitted ? (
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <CheckCircle2
                    className="w-12 h-12 mx-auto mb-3"
                    style={{ color: '#16a34a' }}
                    strokeWidth={1.5}
                  />
                </motion.div>
                <h4 className="text-[16px] font-bold mb-1" style={{ color: '#09090b' }}>
                  הבריף נשלח
                </h4>
                <p className="text-[13px]" style={{ color: '#71717a' }}>
                  נחזור אליך בהקדם
                </p>
              </div>
            ) : showBrief ? (
              <MiniBriefForm
                service={service}
                accountId={accountId}
                sessionId={sessionId}
                onSubmitted={handleSubmitted}
                onCancel={() => setShowBrief(false)}
              />
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleAsk}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl transition-all text-right active:scale-[0.99] hover:bg-zinc-50"
                  style={{ border: '1px solid #e4e4e7' }}
                >
                  <MessageCircle
                    className="w-[18px] h-[18px] flex-shrink-0"
                    style={{ color: '#09090b' }}
                    strokeWidth={1.75}
                  />
                  <div className="flex-1 min-w-0 text-right">
                    <div className="font-semibold text-[14px]" style={{ color: '#09090b' }}>
                      שאל אותי על השירות
                    </div>
                  </div>
                  <ArrowLeft
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: '#a1a1aa' }}
                  />
                </button>

                {enableBrief && (
                  <button
                    onClick={() => setShowBrief(true)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl text-right active:scale-[0.99] transition-all hover:opacity-90"
                    style={{ background: '#09090b', color: '#fff' }}
                  >
                    <FileText
                      className="w-[18px] h-[18px] flex-shrink-0"
                      strokeWidth={1.75}
                    />
                    <div className="flex-1 min-w-0 text-right">
                      <div className="font-semibold text-[14px]">השאר פרטים לבריף</div>
                    </div>
                    <ArrowLeft className="w-4 h-4 flex-shrink-0" style={{ opacity: 0.7 }} />
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Service Card — portrait 9:16, train-track horizontal scroll
// ---------------------------------------------------------------------------

function ServiceCard({
  svc,
  onClick,
  index,
}: {
  svc: Service;
  onClick: () => void;
  index: number;
}) {
  const Icon = resolveIcon(svc.name);
  const ai = isAIService(svc);
  const cardName = svc.name_he || svc.name;

  // 9:16 portrait — width 180px, height 320px (close to true 9:16)
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.25 }}
      onClick={onClick}
      className="group relative flex-shrink-0 flex flex-col text-right rounded-2xl overflow-hidden transition-all active:scale-[0.98] snap-start"
      style={{
        width: 200,
        aspectRatio: '9 / 16',
        background: ai
          ? 'linear-gradient(180deg, #fdf2f8 0%, #fce7f3 60%, #f9a8d4 100%)'
          : 'linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%)',
        border: ai ? '1px solid #fbcfe8' : '1px solid #e4e4e7',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {/* index */}
      <div
        className="absolute top-3 left-3 text-[10px] font-bold tracking-widest tabular-nums"
        style={{ color: ai ? 'rgba(219,39,119,0.6)' : 'rgba(9,9,11,0.35)' }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Top — icon area */}
      <div className="flex-1 flex items-center justify-center px-5 pt-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105"
          style={{
            background: ai ? 'rgba(255,255,255,0.7)' : '#ffffff',
            border: ai ? '1px solid rgba(251,207,232,0.7)' : '1px solid #e4e4e7',
            boxShadow: ai
              ? '0 4px 12px rgba(219,39,119,0.12)'
              : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <Icon
            className="w-7 h-7"
            style={{ color: ai ? '#db2777' : '#09090b' }}
            strokeWidth={1.5}
          />
        </div>
      </div>

      {/* Bottom — text */}
      <div className="px-4 pb-4 text-right">
        <div
          className="text-[14.5px] font-bold leading-[1.25] mb-1.5 line-clamp-2"
          style={{ color: ai ? '#831843' : '#09090b' }}
        >
          {cardName}
        </div>
        <div
          className="text-[10.5px] leading-snug line-clamp-3"
          style={{ color: ai ? 'rgba(131,24,67,0.7)' : '#71717a' }}
        >
          {svc.description}
        </div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Figma mobile card — white card, dark icon tile, Hebrew title + description
// ---------------------------------------------------------------------------

function FigmaServiceCard({
  svc,
  index,
  onClick,
}: {
  svc: Service;
  index: number;
  onClick: () => void;
}) {
  const cardName = svc.name_he || svc.name;
  const iconSrc = resolveFigmaIcon(svc.name);

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.22 }}
      onClick={onClick}
      className="group flex flex-col text-center rounded-2xl transition-all active:scale-[0.98]"
      style={{
        background: '#ffffff',
        border: '1px solid #eef1f5',
        boxShadow: '0 1px 3px rgba(12,16,19,0.04)',
        padding: '14px 12px 12px',
        minHeight: 154,
      }}
    >
      {/* Dark icon tile (centered horizontally) */}
      <div
        className="rounded-2xl flex items-center justify-center mb-2.5 mx-auto"
        style={{
          width: 52,
          height: 52,
          background: '#0c1013',
        }}
      >
        <img
          src={iconSrc}
          alt=""
          width={20}
          height={20}
          style={{ width: 20, height: 20, display: 'block' }}
        />
      </div>

      {/* Title */}
      <div
        className="text-[13.5px] font-bold leading-[1.25] mb-1 line-clamp-2"
        style={{ color: '#0c1013' }}
      >
        {cardName}
      </div>

      {/* Description */}
      <div
        className="text-[10.5px] leading-[1.35] line-clamp-3"
        style={{ color: '#9aa3b0' }}
      >
        {svc.description}
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  count,
  isAI,
}: {
  title: string;
  count: number;
  isAI?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between mb-4 px-0.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[18px] font-bold tracking-tight" style={{ color: '#09090b' }}>
          {title}
        </h2>
        <span
          className="text-[12px] font-medium tabular-nums"
          style={{ color: isAI ? '#db2777' : '#a1a1aa' }}
        >
          {String(count).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ServicesCatalogTab({
  accountId,
  onAskAbout,
  sessionId,
  enableBrief,
  bentoMode,
}: ServicesCatalogTabProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/influencer/content/products?accountId=${accountId}`);
        const data = await res.json();
        const svc = (data.products || [])
          .filter((p: Service) => p.category === 'service' && p.is_available !== false)
          .sort((a: Service, b: Service) => (b.priority ?? 0) - (a.priority ?? 0));
        setServices(svc);
      } catch (err) {
        console.error('Failed to load services:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  const { aiServices, classicServices } = useMemo(() => {
    const ai: Service[] = [];
    const classic: Service[] = [];
    for (const s of services) {
      if (isAIService(s)) ai.push(s);
      else classic.push(s);
    }
    return { aiServices: ai, classicServices: classic };
  }, [services]);

  if (loading) {
    return (
      <div
        className="h-full overflow-y-auto px-5 py-8 pb-32"
        style={{ direction: 'rtl', backgroundColor: '#ffffff' }}
      >
        <div className="space-y-8">
          <div>
            <div className="h-8 w-48 rounded bg-zinc-100 animate-pulse mb-2" />
            <div className="h-4 w-72 rounded bg-zinc-100 animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="h-5 w-24 rounded bg-zinc-100 animate-pulse" />
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-zinc-100 animate-pulse flex-shrink-0"
                  style={{ width: 200, aspectRatio: '9/16' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center px-6 py-10"
        style={{ direction: 'rtl', backgroundColor: '#ffffff' }}
      >
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#fafafa', border: '1px solid #e4e4e7' }}
          >
            <Sparkles className="w-6 h-6" style={{ color: '#a1a1aa' }} strokeWidth={1.5} />
          </div>
          <h3 className="text-[15px] font-bold mb-1" style={{ color: '#09090b' }}>
            אין שירותים להצגה
          </h3>
        </div>
      </div>
    );
  }

  // Unified Figma card grid — applies on every viewport, replaces the bento
  // and the train-track layouts. 3 cols on mobile, scales up on wider screens.
  if (isMobile || bentoMode) {
    return (
      <div
        className="h-full overflow-y-auto pb-32"
        style={{ direction: 'rtl', backgroundColor: '#ffffff' }}
      >
        <header className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 text-right">
          <h1
            className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-[1.2]"
            style={{ color: '#0c1013' }}
          >
            השירותים שלנו
          </h1>
          <p className="text-[13px] sm:text-[14px] mt-1" style={{ color: '#676767' }}>
            פתרונות דיגיטלים מותאמים לצמיחה שלכם
          </p>
        </header>

        <div className="px-4 sm:px-6 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {services.map((svc, i) => (
            <FigmaServiceCard
              key={svc.id}
              svc={svc}
              index={i}
              onClick={() => setSelectedService(svc)}
            />
          ))}
        </div>

        {selectedService && (
          <ServiceModal
            service={selectedService}
            accountId={accountId}
            sessionId={sessionId}
            enableBrief={enableBrief}
            onClose={() => setSelectedService(null)}
            onAskAbout={onAskAbout}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto px-5 py-8 pb-32"
      style={{ direction: 'rtl', backgroundColor: '#ffffff' }}
    >
      {/* Header */}
      <header className="mb-9">
        <h1
          className="text-[26px] font-bold tracking-tight leading-[1.15] mb-2"
          style={{ color: '#09090b' }}
        >
          השירותים שלנו
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: '#52525b' }}>
          {services.length} פתרונות פעילים — לחצו על אחד לפרטים, שאלה לבוט, או טופס בריף.
        </p>
      </header>

      {/* AI Section */}
      {aiServices.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="AI" count={aiServices.length} isAI />
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-5 px-5"
            style={{
              scrollPaddingInline: '20px',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            {aiServices.map((svc, i) => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                index={i}
                onClick={() => setSelectedService(svc)}
              />
            ))}
            {/* End spacer for last card breathing room */}
            <div className="flex-shrink-0 w-1" />
          </div>
        </section>
      )}

      {/* Classic Section */}
      {classicServices.length > 0 && (
        <section>
          <SectionHeader title="שיווק וקריאייטיב" count={classicServices.length} />
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-5 px-5"
            style={{
              scrollPaddingInline: '20px',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            {classicServices.map((svc, i) => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                index={i}
                onClick={() => setSelectedService(svc)}
              />
            ))}
            <div className="flex-shrink-0 w-1" />
          </div>
        </section>
      )}

      {selectedService && (
        <ServiceModal
          service={selectedService}
          accountId={accountId}
          sessionId={sessionId}
          enableBrief={enableBrief}
          onClose={() => setSelectedService(null)}
          onAskAbout={onAskAbout}
        />
      )}
    </div>
  );
}
