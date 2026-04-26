'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Loader2,
  CheckCircle2,
  ChevronLeft,
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
}

interface ServicesCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string, hiddenContext?: string) => void;
  sessionId?: string | null;
  enableBrief?: boolean;
}

// ---------------------------------------------------------------------------
// Icon mapping — lucide-react (no font dependency)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  // AI products
  NewVoices: Mic,
  'Influencer Marketing AI': Network,
  'Leaders Platform': LayoutDashboard,
  'AI Implementation': Workflow,
  'AI Automations': Zap,
  // Classic services
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

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Sparkles;
}

function isAIService(svc: Service): boolean {
  return (
    svc.subcategory === 'ai' ||
    svc.product_line === 'ai' ||
    !!svc.name.match(/\b(AI|NewVoices|IMAI|Leaders Platform)\b/i)
  );
}

// ---------------------------------------------------------------------------
// MiniBriefForm — keeps existing /api/briefs flow + conference mirror
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

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'שדה חובה';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'אימייל לא תקין';
    if (form.phone.trim() && !/^[\d\-+() ]{7,15}$/.test(form.phone.trim())) e.phone = 'מספר לא תקין';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validate()) setStep(2);
  }

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
    'w-full h-[50px] px-5 rounded-full text-[15px] outline-none transition-all focus:ring-2 focus:ring-pink-500/20';
  const inputStyle = {
    backgroundColor: '#f4f5f7',
    color: '#0c1013',
    border: '1px solid #e5e5ea',
  };

  return (
    <div className="flex flex-col h-full" style={{ direction: 'rtl' }}>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 px-1">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                background: step >= s ? '#db2777' : '#f4f5f7',
                color: step >= s ? '#fff' : '#9aa3b0',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: step >= s ? '#0c1013' : '#9aa3b0' }}
            >
              {s === 1 ? 'פרטים' : 'על הפרויקט'}
            </span>
            {s < 2 && (
              <div
                className="flex-1 h-0.5 rounded transition-colors"
                style={{ background: step > s ? '#db2777' : '#f4f5f7' }}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                type="email"
                placeholder="אימייל"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={`${inputClasses} ${errors.email ? '!border-red-500' : ''}`}
                style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
              />
              {errors.email && (
                <p className="text-red-500 text-[11px] mt-1 px-3">{errors.email}</p>
              )}
            </div>
            <div>
              <input
                type="tel"
                placeholder="טלפון"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={`${inputClasses} ${errors.phone ? '!border-red-500' : ''}`}
                style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
              />
              {errors.phone && (
                <p className="text-red-500 text-[11px] mt-1 px-3">{errors.phone}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          <textarea
            placeholder="ספר/י בקצרה על המוצר או השירות שלך"
            value={form.productDescription}
            onChange={(e) => set('productDescription', e.target.value)}
            rows={2}
            className="w-full px-5 py-3 rounded-2xl text-[15px] outline-none transition-all focus:ring-2 focus:ring-pink-500/20 resize-none"
            style={inputStyle}
          />
          <div>
            <label
              className="block text-xs font-semibold mb-2 px-1"
              style={{ color: '#676767' }}
            >
              מה המטרה העיקרית?
            </label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('goal', form.goal === g ? '' : g)}
                  className="px-4 py-2 rounded-full text-xs font-medium border transition-all active:scale-[0.98]"
                  style={{
                    borderColor: form.goal === g ? '#db2777' : '#e5e5ea',
                    background: form.goal === g ? '#db2777' : '#fff',
                    color: form.goal === g ? '#fff' : '#0c1013',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label
              className="block text-xs font-semibold mb-2 px-1"
              style={{ color: '#676767' }}
            >
              תקציב משוער
            </label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('budgetRange', form.budgetRange === b ? '' : b)}
                  className="px-4 py-2 rounded-full text-xs font-medium border transition-all active:scale-[0.98]"
                  style={{
                    borderColor: form.budgetRange === b ? '#db2777' : '#e5e5ea',
                    background: form.budgetRange === b ? '#db2777' : '#fff',
                    color: form.budgetRange === b ? '#fff' : '#0c1013',
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <textarea
            placeholder="עוד משהו חשוב? (אופציונלי)"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            className="w-full px-5 py-3 rounded-2xl text-[15px] outline-none transition-all focus:ring-2 focus:ring-pink-500/20 resize-none"
            style={inputStyle}
          />
        </div>
      )}

      <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #f0f3f7' }}>
        {step === 1 ? (
          <>
            <button
              onClick={onCancel}
              className="px-5 py-3 rounded-full text-sm font-medium transition-colors hover:bg-zinc-50"
              style={{ border: '1px solid #e5e5ea', color: '#676767' }}
            >
              ביטול
            </button>
            <button
              onClick={handleNext}
              className="flex-1 h-[50px] rounded-full text-[15px] font-semibold text-white transition-all hover:opacity-90"
              style={{ background: '#0c1013' }}
            >
              המשך →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="px-5 py-3 rounded-full text-sm font-medium transition-colors hover:bg-zinc-50"
              style={{ border: '1px solid #e5e5ea', color: '#676767' }}
            >
              ← חזרה
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-[50px] rounded-full text-[15px] font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: '#0c1013' }}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שלח בריף'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Modal
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

  function handleAsk() {
    const question = `ספרו לי על ${displayName}`;
    const context = `[הקשר השירות:]\nשם: ${service.name}${
      service.name_he ? ` (${service.name_he})` : ''
    }\nתיאור: ${service.description}`;
    onAskAbout(question, context);
    onClose();
  }

  function handleSubmitted(form: Record<string, string>) {
    setBriefSubmitted(true);
    setTimeout(() => {
      const question = `שלחתי בריף לגבי ${displayName}`;
      const context = `[בריף שנשלח:]\nשירות: ${displayName}\nשם: ${form.fullName}${
        form.businessName ? `\nעסק: ${form.businessName}` : ''
      }${form.goal ? `\nמטרה: ${form.goal}` : ''}${
        form.budgetRange ? `\nתקציב: ${form.budgetRange}` : ''
      }`;
      onAskAbout(question, context);
      onClose();
    }, 2000);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl"
          style={{ direction: 'rtl' }}
        >
          {/* Header with gradient hero */}
          <div
            className="relative px-6 pt-6 pb-5"
            style={{
              background: ai
                ? 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)'
                : '#fafbfc',
            }}
          >
            {ai && (
              <span
                className="inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-full mb-3"
                style={{ background: '#db2777', color: '#fff' }}
              >
                AI · LDRS
              </span>
            )}
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{
                  background: ai ? '#fff' : '#fff',
                  border: ai ? '1px solid #fbcfe8' : '1px solid #eef1f5',
                }}
              >
                <Icon
                  className="w-6 h-6"
                  style={{ color: ai ? '#db2777' : '#0c1013' }}
                  strokeWidth={1.75}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[19px] font-bold leading-tight" style={{ color: '#0c1013' }}>
                  {displayName}
                </h3>
                <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: '#676767' }}>
                  {service.description}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/5 flex-shrink-0"
                aria-label="סגור"
              >
                <X className="w-4 h-4" style={{ color: '#676767' }} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 flex-1 overflow-y-auto">
            {briefSubmitted ? (
              <div className="text-center py-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <CheckCircle2
                    className="w-14 h-14 mx-auto mb-4"
                    style={{ color: '#34c759' }}
                    strokeWidth={1.5}
                  />
                </motion.div>
                <h4 className="text-[18px] font-bold mb-1" style={{ color: '#0c1013' }}>
                  הבריף נשלח!
                </h4>
                <p className="text-[14px]" style={{ color: '#676767' }}>
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
              <div className="space-y-3">
                <button
                  onClick={handleAsk}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all text-right active:scale-[0.99]"
                  style={{
                    background: '#fafbfc',
                    border: '1px solid #eef1f5',
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: '#fdf2f8' }}
                  >
                    <MessageCircle
                      className="w-5 h-5"
                      style={{ color: '#db2777' }}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px]" style={{ color: '#0c1013' }}>
                      שאל אותי על השירות
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: '#676767' }}>
                      תשובות מדויקות מתוך מאות פרויקטים
                    </div>
                  </div>
                  <ChevronLeft
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: '#9aa3b0' }}
                  />
                </button>

                {enableBrief && (
                  <button
                    onClick={() => setShowBrief(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl text-right active:scale-[0.99] transition-all hover:opacity-90"
                    style={{
                      background: '#0c1013',
                      color: '#fff',
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      <FileText className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[14px]">השאר פרטים לבריף</div>
                      <div className="text-[12px] mt-0.5" style={{ opacity: 0.7 }}>
                        טופס קצר ונחזור אליך עם הצעה
                      </div>
                    </div>
                    <ChevronLeft
                      className="w-4 h-4 flex-shrink-0"
                      style={{ opacity: 0.7 }}
                    />
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
// Service Card
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

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      onClick={onClick}
      className="group relative flex flex-col items-start text-right p-4 rounded-2xl transition-all active:scale-[0.98] overflow-hidden"
      style={{
        background: ai
          ? 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)'
          : '#ffffff',
        border: ai ? '1px solid #fbcfe8' : '1px solid #eef1f5',
        minHeight: 140,
      }}
    >
      {ai && (
        <span
          className="absolute top-3 left-3 text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
          style={{ background: '#db2777', color: '#fff' }}
        >
          AI
        </span>
      )}

      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
        style={{
          background: ai ? '#ffffff' : '#fafbfc',
          border: ai ? '1px solid #fbcfe8' : '1px solid #eef1f5',
        }}
      >
        <Icon
          className="w-[22px] h-[22px]"
          style={{ color: ai ? '#db2777' : '#0c1013' }}
          strokeWidth={1.75}
        />
      </div>

      <div className="text-[14px] font-bold leading-tight mb-1" style={{ color: '#0c1013' }}>
        {cardName}
      </div>
      <div
        className="text-[11.5px] leading-relaxed line-clamp-2"
        style={{ color: '#676767' }}
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
  eyebrow,
  title,
  subtitle,
  accent,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent?: 'ai' | 'classic';
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <div>
        <div
          className="text-[10px] font-bold tracking-widest uppercase mb-1"
          style={{ color: accent === 'ai' ? '#db2777' : '#9aa3b0' }}
        >
          {eyebrow}
        </div>
        <h2 className="text-[19px] font-bold" style={{ color: '#0c1013' }}>
          {title}
        </h2>
        <p className="text-[12.5px] mt-1" style={{ color: '#676767' }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ServicesCatalogTab({
  accountId,
  onAskAbout,
  sessionId,
  enableBrief,
}: ServicesCatalogTabProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/influencer/content/products?accountId=${accountId}`);
        const data = await res.json();
        const svc = (data.products || [])
          .filter((p: Service) => p.category === 'service')
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
        className="h-full overflow-y-auto px-4 py-5 pb-32"
        style={{ direction: 'rtl', backgroundColor: '#ffffff' }}
      >
        <div className="space-y-6">
          {/* Skeleton hero */}
          <div className="h-7 w-2/3 rounded-full bg-zinc-100 animate-pulse" />
          {/* Skeleton cards */}
          {[0, 1].map((row) => (
            <div key={row} className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[140px] rounded-2xl bg-zinc-50 animate-pulse"
                />
              ))}
            </div>
          ))}
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
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#fafbfc', border: '1px solid #eef1f5' }}
          >
            <Sparkles className="w-7 h-7" style={{ color: '#9aa3b0' }} strokeWidth={1.5} />
          </div>
          <h3 className="text-[16px] font-bold mb-1" style={{ color: '#0c1013' }}>
            אין שירותים להצגה
          </h3>
          <p className="text-[13px]" style={{ color: '#676767' }}>
            נסו שוב בעוד רגע
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto px-4 py-6 pb-32"
      style={{
        direction: 'rtl',
        backgroundColor: '#ffffff',
        backgroundImage:
          'radial-gradient(circle at 100% 0%, rgba(252, 231, 243, 0.4) 0%, transparent 50%)',
      }}
    >
      {/* Hero */}
      <div className="mb-7 px-1">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: '#db2777' }}
          />
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: '#db2777' }}
          >
            LDRS · השירותים שלנו
          </span>
        </div>
        <h1 className="text-[24px] font-bold leading-tight" style={{ color: '#0c1013' }}>
          מ-AI ארגוני ועד קמפיין 360°
        </h1>
        <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: '#676767' }}>
          לחץ על שירות לפרטים, שאלה לבוט או טופס בריף.
        </p>
      </div>

      {/* AI Section */}
      {aiServices.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            eyebrow="AI · מוצרים שלנו"
            title="פלטפורמות AI שלידרס בונה"
            subtitle="מוצרים פנימיים שהפכו לפתרונות לקוחות"
            accent="ai"
          />
          <div className="grid grid-cols-2 gap-3">
            {aiServices.map((svc, i) => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                index={i}
                onClick={() => setSelectedService(svc)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Divider */}
      {aiServices.length > 0 && classicServices.length > 0 && (
        <div className="my-8 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: '#eef1f5' }} />
          <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#9aa3b0' }}>
            ◆
          </span>
          <div className="flex-1 h-px" style={{ background: '#eef1f5' }} />
        </div>
      )}

      {/* Classic services */}
      {classicServices.length > 0 && (
        <section className="mb-6">
          <SectionHeader
            eyebrow="שיווק · קריאייטיב · מדיה"
            title="הליבה של LDRS"
            subtitle="פרפורמנס 360°, משפיענים, תוכן והפקות"
            accent="classic"
          />
          <div className="grid grid-cols-2 gap-3">
            {classicServices.map((svc, i) => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                index={i}
                onClick={() => setSelectedService(svc)}
              />
            ))}
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
