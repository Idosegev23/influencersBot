'use client';

import { useState, useEffect, useMemo } from 'react';
import ConferenceMeetingForm from './ConferenceMeetingForm';

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
  is_featured?: boolean;
}

interface ServicesCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string, hiddenContext?: string) => void;
  sessionId?: string | null;
  enableBrief?: boolean;
  conferenceMode?: boolean;
}

// ---------------------------------------------------------------------------
// Icon mapping — LDRS services
// ---------------------------------------------------------------------------

const SERVICE_ICONS: Record<string, string> = {
  // AI pillar
  'NewVoices': 'record_voice_over',
  'Influencer Marketing AI': 'hub',
  'IMAI': 'hub',
  'Leaders Platform': 'dashboard_customize',
  'AI Implementation': 'settings_suggest',
  'הטמעת AI': 'settings_suggest',
  'AI Automations': 'bolt',
  'אוטומציות AI': 'bolt',
  // Traditional
  'Content Creation': 'edit_note',
  'SEO': 'trending_up',
  'Paid Social Advertising': 'ads_click',
  'Video Production': 'movie',
  'Podcast Production': 'mic',
  'Performance Marketing / PPC': 'search_insights',
  'Social Media Management': 'group_work',
  'Television Advertising': 'tv',
  'Influencer Marketing': 'campaign',
};

function resolveIcon(svc: Service): string {
  return (
    SERVICE_ICONS[svc.name] ||
    SERVICE_ICONS[svc.name_he || ''] ||
    (svc.subcategory === 'ai' ? 'auto_awesome' : 'handshake')
  );
}

function isAIService(svc: Service): boolean {
  return (
    svc.subcategory === 'ai' ||
    svc.product_line === 'ai' ||
    !!svc.name.match(/\b(AI|NewVoices|IMAI|Leaders Platform|Automations)\b/i) ||
    !!(svc.name_he || '').match(/AI|ניו ווייסס|אוטומציות/i)
  );
}

// ---------------------------------------------------------------------------
// MiniBriefForm (non-conference mode — keeps original behavior)
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
    if (errors[key]) setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'שדה חובה';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'אימייל לא תקין';
    if (form.phone.trim() && !/^[\d\-+() ]{7,15}$/.test(form.phone.trim())) e.phone = 'מספר לא תקין';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() { if (validate()) setStep(2); }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
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
      if (data.success) onSubmitted(form);
    } catch (err) {
      console.error('Brief submit error:', err);
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
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: step >= s ? '#5FD4F5' : '#1E2B52', color: step >= s ? '#061021' : '#5E6E94' }}
            >
              {step > s ? '✓' : s}
            </div>
            <span className="text-xs font-medium" style={{ color: step >= s ? '#ffffff' : '#5E6E94' }}>
              {s === 1 ? 'פרטים' : 'על הפרויקט'}
            </span>
            {s < 2 && <div className="flex-1 h-0.5 rounded" style={{ background: step > s ? '#5FD4F5' : '#1E2B52' }} />}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-3 flex-1">
          <div>
            <input type="text" placeholder="שם מלא *" value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              className={`${inputClasses} ${errors.fullName ? '!border-red-500' : ''}`} autoFocus />
            {errors.fullName && <p className="text-red-400 text-[11px] mt-1 px-1">{errors.fullName}</p>}
          </div>
          <input type="text" placeholder="שם העסק" value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)} className={inputClasses} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input type="email" placeholder="אימייל" value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={`${inputClasses} ${errors.email ? '!border-red-500' : ''}`}
                style={{ direction: 'ltr', textAlign: 'right' }} />
              {errors.email && <p className="text-red-400 text-[11px] mt-1 px-1">{errors.email}</p>}
            </div>
            <div>
              <input type="tel" placeholder="טלפון" value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={`${inputClasses} ${errors.phone ? '!border-red-500' : ''}`}
                style={{ direction: 'ltr', textAlign: 'right' }} />
              {errors.phone && <p className="text-red-400 text-[11px] mt-1 px-1">{errors.phone}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          <textarea placeholder="ספר/י בקצרה על העסק שלך" value={form.productDescription}
            onChange={(e) => set('productDescription', e.target.value)} rows={2}
            className={`${inputClasses} resize-none`} />
          <div>
            <label className="block text-xs font-semibold mb-2 text-[#9BA8C4]">מה המטרה?</label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button key={g} type="button" onClick={() => set('goal', form.goal === g ? '' : g)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.goal === g ? '#5FD4F5' : '#1E2B52',
                    background: form.goal === g ? '#5FD4F5' : 'transparent',
                    color: form.goal === g ? '#061021' : '#9BA8C4',
                  }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-2 text-[#9BA8C4]">תקציב משוער</label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button key={b} type="button" onClick={() => set('budgetRange', form.budgetRange === b ? '' : b)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.budgetRange === b ? '#5FD4F5' : '#1E2B52',
                    background: form.budgetRange === b ? '#5FD4F5' : 'transparent',
                    color: form.budgetRange === b ? '#061021' : '#9BA8C4',
                  }}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          <textarea placeholder="עוד משהו חשוב? (אופציונלי)" value={form.notes}
            onChange={(e) => set('notes', e.target.value)} rows={2} className={`${inputClasses} resize-none`} />
        </div>
      )}

      <div className="flex gap-3 mt-4 pt-3 border-t border-[#1E2B52]">
        {step === 1 ? (
          <>
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#1E2B52] text-[#9BA8C4] hover:bg-[#0a1433] transition-colors">
              ביטול
            </button>
            <button onClick={handleNext} className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors"
              style={{ background: '#5FD4F5', color: '#061021' }}>
              המשך →
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#1E2B52] text-[#9BA8C4] hover:bg-[#0a1433] transition-colors">
              ← חזרה
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              style={{ background: '#5FD4F5', color: '#061021' }}>
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#061021] border-t-transparent rounded-full animate-spin" />
                  <span>שולח...</span>
                </>
              ) : (
                'שלח בריף'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Detail Modal — LDRS dark brand
// ---------------------------------------------------------------------------

function ServiceModal({
  service,
  accountId,
  sessionId,
  enableBrief,
  conferenceMode,
  onClose,
  onAskAbout,
}: {
  service: Service;
  accountId: string;
  sessionId?: string | null;
  enableBrief?: boolean;
  conferenceMode?: boolean;
  onClose: () => void;
  onAskAbout: (question: string, hiddenContext?: string) => void;
}) {
  const [showBrief, setShowBrief] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const icon = resolveIcon(service);
  const ai = isAIService(service);

  function handleAsk() {
    const displayName = service.name_he || service.name;
    const question = `ספרו לי על ${displayName}`;
    const context = `[הקשר השירות:]\nשם: ${service.name}${service.name_he ? ` (${service.name_he})` : ''}\nתיאור: ${service.description}`;
    onAskAbout(question, context);
    onClose();
  }

  function handleSubmitted(form: Record<string, string>) {
    setSubmitted(true);
    setTimeout(() => {
      const displayName = service.name_he || service.name;
      const question = conferenceMode
        ? `הגשתי בקשה לפגישה — תחום: ${displayName}`
        : `שלחתי בריף לגבי ${displayName}`;
      const context = conferenceMode
        ? `[פגישה מהכנס:]\nתחום: ${displayName}\nשם: ${form.fullName}${form.companyName ? `\nחברה: ${form.companyName}` : ''}${form.role ? `\nתפקיד: ${form.role}` : ''}${form.primaryArea ? `\nתחום עניין: ${form.primaryArea}` : ''}${form.currentAiUsage ? `\nשימוש ב-AI היום: ${form.currentAiUsage}` : ''}${form.readiness ? `\nטווח זמן: ${form.readiness}` : ''}`
        : `[בריף שנשלח:]\nשירות: ${displayName}\nשם: ${form.fullName}${form.businessName ? `\nעסק: ${form.businessName}` : ''}${form.goal ? `\nמטרה: ${form.goal}` : ''}${form.budgetRange ? `\nתקציב: ${form.budgetRange}` : ''}`;
      onAskAbout(question, context);
      onClose();
    }, 2200);
  }

  const displayName = service.name_he || service.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:max-w-md max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{
          background: 'linear-gradient(180deg, #0a1433 0%, #061021 100%)',
          border: '1px solid #1E2B52',
          direction: 'rtl',
        }}
      >
        <div
          className="p-5 pb-4 flex items-start gap-4"
          style={{ background: ai ? 'linear-gradient(135deg, rgba(95,212,245,0.08) 0%, transparent 100%)' : 'transparent' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: ai ? 'rgba(95,212,245,0.15)' : '#0f1a3a',
              border: `1px solid ${ai ? '#5FD4F5' : '#1E2B52'}`,
            }}
          >
            <span
              className="material-symbols-outlined text-[24px]"
              style={{ color: ai ? '#5FD4F5' : '#ffffff' }}
            >
              {icon}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            {ai && (
              <span
                className="inline-block text-[10px] font-bold tracking-wider uppercase mb-1 px-2 py-0.5 rounded"
                style={{ background: '#5FD4F5', color: '#061021' }}
              >
                * AI
              </span>
            )}
            <h3 className="text-lg font-bold text-white">{displayName}</h3>
            <p className="text-sm text-[#9BA8C4] mt-1 leading-relaxed">{service.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px] text-[#5E6E94]">close</span>
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {submitted ? (
            <div className="text-center py-8">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: '#5FD4F5' }}
              >
                <span
                  className="material-symbols-outlined text-[32px]"
                  style={{ color: '#061021', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </div>
              <h4 className="text-lg font-bold text-white mb-1">
                {conferenceMode ? 'הבקשה נשלחה!' : 'הבריף נשלח בהצלחה!'}
              </h4>
              <p className="text-sm text-[#9BA8C4]">
                {conferenceMode ? 'נחזור אליכם תוך 48 שעות' : 'נחזור אליך בהקדם'}
              </p>
            </div>
          ) : showMeeting ? (
            <ConferenceMeetingForm
              accountId={accountId}
              sessionId={sessionId}
              serviceName={displayName}
              onSubmitted={handleSubmitted}
              onCancel={() => setShowMeeting(false)}
            />
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
                className="w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-right"
                style={{ background: '#0f1a3a', borderColor: '#1E2B52' }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: '#061021', border: '1px solid #5FD4F5' }}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ color: '#5FD4F5' }}>chat</span>
                </div>
                <div>
                  <span className="font-bold text-sm text-white block">שאל אותי על השירות</span>
                  <span className="text-xs text-[#9BA8C4]">דברו איתי בצ׳אט — אני אסביר</span>
                </div>
              </button>

              {conferenceMode ? (
                <button
                  onClick={() => setShowMeeting(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl transition-all text-right"
                  style={{ background: '#5FD4F5', color: '#061021' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: '#061021' }}
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{ color: '#5FD4F5' }}>event</span>
                  </div>
                  <div>
                    <span className="font-bold text-sm block">בואו נקבע פגישה</span>
                    <span className="text-xs opacity-70">השאירו פרטים — נחזור אליכם תוך 48 שעות</span>
                  </div>
                </button>
              ) : (
                enableBrief && (
                  <button
                    onClick={() => setShowBrief(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl transition-all text-right"
                    style={{ background: '#5FD4F5', color: '#061021' }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: '#061021' }}
                    >
                      <span className="material-symbols-outlined text-[20px]" style={{ color: '#5FD4F5' }}>description</span>
                    </div>
                    <div>
                      <span className="font-bold text-sm block">השאר פרטים לבריף</span>
                      <span className="text-xs opacity-70">מלא טופס קצר — נחזור עם הצעה</span>
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Card
// ---------------------------------------------------------------------------

function ServiceCard({ svc, onClick }: { svc: Service; onClick: () => void }) {
  const ai = isAIService(svc);
  const icon = resolveIcon(svc);
  const displayName = svc.name_he || svc.name;

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center text-center p-4 rounded-2xl transition-all duration-200 active:scale-[0.98] overflow-hidden"
      style={{
        background: ai
          ? 'linear-gradient(180deg, rgba(95,212,245,0.06) 0%, #0f1a3a 100%)'
          : '#0f1a3a',
        border: `1px solid ${ai ? 'rgba(95,212,245,0.4)' : '#1E2B52'}`,
      }}
    >
      {ai && (
        <span
          className="absolute top-2 left-2 text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded"
          style={{ background: '#5FD4F5', color: '#061021' }}
        >
          AI
        </span>
      )}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
        style={{
          background: ai ? 'rgba(95,212,245,0.12)' : '#061021',
          border: `1px solid ${ai ? '#5FD4F5' : '#1E2B52'}`,
        }}
      >
        <span
          className="material-symbols-outlined text-[24px]"
          style={{ color: ai ? '#5FD4F5' : '#ffffff' }}
        >
          {icon}
        </span>
      </div>
      <span className="text-[13px] font-bold text-white leading-tight">{displayName}</span>
      <span className="text-[11px] text-[#9BA8C4] mt-1.5 line-clamp-2 w-full">
        {(svc.description || '').slice(0, 60)}
      </span>
    </button>
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
  conferenceMode,
}: ServicesCatalogTabProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/influencer/content/products?accountId=${accountId}`);
        const data = await res.json();
        const svc = (data.products || []).filter((p: Service) => p.category === 'service');
        setServices(svc);
      } catch (err) {
        console.error('Failed to load services:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  const { aiServices, traditionalServices } = useMemo(() => {
    const ai: Service[] = [];
    const trad: Service[] = [];
    for (const s of services) {
      if (isAIService(s)) ai.push(s);
      else trad.push(s);
    }
    ai.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    trad.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return { aiServices: ai, traditionalServices: trad };
  }, [services]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-16"
        style={{ background: '#061021', minHeight: '60vh' }}
      >
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#5FD4F5', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 text-[#9BA8C4] text-sm" style={{ background: '#061021', minHeight: '60vh' }}>
        <span className="material-symbols-outlined text-[48px] mb-3 block">info</span>
        אין שירותים להצגה
      </div>
    );
  }

  return (
    <div
      className="px-4 py-5"
      style={{
        direction: 'rtl',
        background: 'linear-gradient(180deg, #061021 0%, #0a1433 100%)',
        minHeight: '100%',
      }}
    >
      <div className="mb-6 text-right">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl font-black" style={{ color: '#5FD4F5' }}>*</span>
          <h2 className="text-[20px] font-black text-white tracking-tight">השירותים שלנו</h2>
        </div>
        <p className="text-[12px] text-[#9BA8C4] mt-1 leading-relaxed">
          {conferenceMode
            ? 'בואו לגלות — AI, קריאייטיב, מדיה. לחצו על שירות לפרטים ולקביעת פגישה.'
            : 'פתרונות מקצה-לקצה לצמיחה של המותג שלכם'}
        </p>
      </div>

      {aiServices.length > 0 && (
        <div className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-black" style={{ color: '#5FD4F5' }}>*</span>
            <h3 className="text-[15px] font-bold text-white">AI — תוצאות, לא באזוורדס</h3>
          </div>
          <p className="text-[11px] text-[#7788AD] mb-3 leading-relaxed">
            מוצרים ופתרונות AI שלידרס בונה ומפעילה. פנימי שהפך למוצר.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {aiServices.map((svc) => (
              <ServiceCard key={svc.id} svc={svc} onClick={() => setSelectedService(svc)} />
            ))}
          </div>
        </div>
      )}

      {traditionalServices.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-black" style={{ color: '#5FD4F5' }}>*</span>
            <h3 className="text-[15px] font-bold text-white">שיווק, קריאייטיב ומדיה</h3>
          </div>
          <p className="text-[11px] text-[#7788AD] mb-3 leading-relaxed">
            Performance Marketing 360° — משפיענים, סושיאל, תוכן, הפקות.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {traditionalServices.map((svc) => (
              <ServiceCard key={svc.id} svc={svc} onClick={() => setSelectedService(svc)} />
            ))}
          </div>
        </div>
      )}

      {selectedService && (
        <ServiceModal
          service={selectedService}
          accountId={accountId}
          sessionId={sessionId}
          enableBrief={enableBrief}
          conferenceMode={conferenceMode}
          onClose={() => setSelectedService(null)}
          onAskAbout={onAskAbout}
        />
      )}
    </div>
  );
}
