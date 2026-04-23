'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Service {
  id: string;
  name: string;
  name_he?: string | null;
  description: string;
  category: string;
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
// Service icon mapping
// ---------------------------------------------------------------------------

const SERVICE_ICONS: Record<string, string> = {
  'Content Creation': 'edit_note',
  'SEO': 'trending_up',
  'Paid Social Advertising': 'ads_click',
  'Video Production': 'movie',
  'Podcast Production': 'mic',
  'Performance Marketing / PPC': 'search_insights',
  'Social Media Management': 'group_work',
  'Television Advertising': 'tv',
  'Influencer Marketing': 'campaign',
  'NewVoices': 'record_voice_over',
  'Influencer Marketing AI': 'hub',
  'Leaders Platform': 'dashboard_customize',
  'AI Implementation': 'settings_suggest',
  'AI Automations': 'bolt',
};

// ---------------------------------------------------------------------------
// Mini-Brief Form (white bg, black accents)
// ---------------------------------------------------------------------------

const GOALS = [
  'מודעות למותג',
  'הגדלת מכירות',
  'חדירה לשוק חדש',
  'בניית קהילה',
  'אחר',
];

const BUDGETS = [
  'עד ₪5,000',
  '₪5,000 – ₪15,000',
  '₪15,000 – ₪50,000',
  '₪50,000+',
  'לא בטוח/ה',
];

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
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'אימייל לא תקין';
    }
    if (form.phone.trim() && !/^[\d\-+() ]{7,15}$/.test(form.phone.trim())) {
      e.phone = 'מספר לא תקין';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validate()) setStep(2);
  }

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
      if (data.success) {
        onSubmitted(form);
      }
    } catch (err) {
      console.error('Brief submit error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClasses =
    'w-full px-4 py-3 rounded-xl text-sm bg-white border border-[#E0E0E0] text-black placeholder-[#999] focus:border-black focus:ring-1 focus:ring-black outline-none transition-colors';

  return (
    <div className="flex flex-col h-full">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 px-1">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                background: step >= s ? '#000' : '#E0E0E0',
                color: step >= s ? '#fff' : '#999',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span className="text-xs font-medium" style={{ color: step >= s ? '#000' : '#999' }}>
              {s === 1 ? 'פרטים' : 'על הפרויקט'}
            </span>
            {s < 2 && <div className="flex-1 h-0.5 rounded" style={{ background: step > s ? '#000' : '#E0E0E0' }} />}
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
            {errors.fullName && <p className="text-red-500 text-[11px] mt-1 px-1">{errors.fullName}</p>}
          </div>
          <input
            type="text"
            placeholder="שם העסק"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            className={inputClasses}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                type="email"
                placeholder="אימייל"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={`${inputClasses} ${errors.email ? '!border-red-500' : ''}`}
                style={{ direction: 'ltr' }}
              />
              {errors.email && <p className="text-red-500 text-[11px] mt-1 px-1">{errors.email}</p>}
            </div>
            <div>
              <input
                type="tel"
                placeholder="טלפון"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={`${inputClasses} ${errors.phone ? '!border-red-500' : ''}`}
                style={{ direction: 'ltr' }}
              />
              {errors.phone && <p className="text-red-500 text-[11px] mt-1 px-1">{errors.phone}</p>}
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
            className={`${inputClasses} resize-none`}
          />

          <div>
            <label className="block text-xs font-semibold mb-2 text-[#666]">מה המטרה העיקרית?</label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('goal', form.goal === g ? '' : g)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.goal === g ? '#000' : '#E0E0E0',
                    background: form.goal === g ? '#000' : '#fff',
                    color: form.goal === g ? '#fff' : '#000',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 text-[#666]">תקציב משוער</label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('budgetRange', form.budgetRange === b ? '' : b)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.budgetRange === b ? '#000' : '#E0E0E0',
                    background: form.budgetRange === b ? '#000' : '#fff',
                    color: form.budgetRange === b ? '#fff' : '#000',
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <textarea
            placeholder="עוד משהו חשוב שנדע? (אופציונלי)"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            className={`${inputClasses} resize-none`}
          />
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-4 pt-3 border-t border-[#E0E0E0]">
        {step === 1 ? (
          <>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#E0E0E0] text-[#666] hover:bg-[#F5F5F5] transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleNext}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-black text-white hover:bg-[#222] transition-colors"
            >
              המשך →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#E0E0E0] text-[#666] hover:bg-[#F5F5F5] transition-colors"
            >
              ← חזרה
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-black text-white hover:bg-[#222] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
// Service Detail Modal (white bg, black accents)
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
  colorIndex: number;
  accountId: string;
  sessionId?: string | null;
  enableBrief?: boolean;
  onClose: () => void;
  onAskAbout: (question: string, hiddenContext?: string) => void;
}) {
  const [showBrief, setShowBrief] = useState(false);
  const [briefSubmitted, setBriefSubmitted] = useState(false);
  const icon = SERVICE_ICONS[service.name] || 'handshake';
  const displayName = service.name_he || service.name;

  function handleAsk() {
    const question = `ספרו לי על שירות ${displayName}`;
    const context = `[הקשר השירות:]\nשם: ${displayName}${service.name_he ? ` (${service.name})` : ''}\nתיאור: ${service.description}`;
    onAskAbout(question, context);
    onClose();
  }

  function handleBriefSubmitted(form: Record<string, string>) {
    setBriefSubmitted(true);
    setTimeout(() => {
      const question = `שלחתי בריף לגבי ${displayName}`;
      const context = `[בריף שנשלח:]\nשירות: ${displayName}\nשם: ${form.fullName}\nעסק: ${form.businessName || 'לא צוין'}\nמטרה: ${form.goal || 'לא צוינה'}\nתקציב: ${form.budgetRange || 'לא צוין'}`;
      onAskAbout(question, context);
      onClose();
    }, 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ direction: 'rtl' }}
      >
        {/* Header */}
        <div className="p-5 pb-4 flex items-start gap-4 bg-[#F5F5F5]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-black">
            <span className="material-symbols-outlined text-[24px] text-white">{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-black">{displayName}</h3>
            <p className="text-sm text-[#666] mt-1 leading-relaxed">{service.description}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[20px] text-[#999]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto">
          {briefSubmitted ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-black">
                <span className="material-symbols-outlined text-[32px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <h4 className="text-lg font-bold text-black mb-1">הבריף נשלח בהצלחה!</h4>
              <p className="text-sm text-[#666]">נחזור אליך בהקדם</p>
            </div>
          ) : showBrief ? (
            <MiniBriefForm
              service={service}
              accountId={accountId}
              sessionId={sessionId}
              onSubmitted={handleBriefSubmitted}
              onCancel={() => setShowBrief(false)}
            />
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleAsk}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-[#E0E0E0] hover:border-black transition-all text-right"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-black">
                  <span className="material-symbols-outlined text-[20px] text-white">chat</span>
                </div>
                <div>
                  <span className="font-bold text-sm text-black block">שאל אותי על השירות</span>
                  <span className="text-xs text-[#666]">דברו איתנו בצ׳אט ונסביר הכל</span>
                </div>
              </button>

              {enableBrief && (
                <button
                  onClick={() => setShowBrief(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-black hover:bg-[#F5F5F5] transition-all text-right"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-black">
                    <span className="material-symbols-outlined text-[20px] text-white">description</span>
                  </div>
                  <div>
                    <span className="font-bold text-sm text-black block">השאר פרטים לבריף</span>
                    <span className="text-xs text-[#666]">מלא טופס קצר ונחזור אליך עם הצעה</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component — Services Grid (white bg, black accents)
// ---------------------------------------------------------------------------

export default function ServicesCatalogTab({ accountId, onAskAbout, sessionId, enableBrief }: ServicesCatalogTabProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 text-[#999] text-sm">
        <span className="material-symbols-outlined text-[48px] mb-3 block">info</span>
        אין שירותים להצגה
      </div>
    );
  }

  return (
    <div className="px-4 py-5" style={{ direction: 'rtl' }}>
      {/* Header */}
      <div className="mb-6 text-right">
        <h2 className="text-[18px] font-bold text-black">השירותים שלנו</h2>
        <p className="text-[12px] text-[#666] mt-1">פתרונות דיגיטליים מותאמים לצמיחה שלכם</p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-3 gap-3">
        {services.map((svc, i) => {
          const icon = SERVICE_ICONS[svc.name] || 'handshake';
          const cardName = svc.name_he || svc.name;
          return (
            <button
              key={svc.id}
              onClick={() => { setSelectedService(svc); setSelectedIndex(i); }}
              className="group flex flex-col items-center text-center p-4 rounded-2xl border border-[#E0E0E0] bg-white hover:border-black transition-all duration-200 active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-black transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-[24px] text-white">{icon}</span>
              </div>
              <span className="text-[13px] font-bold text-black leading-tight">{cardName}</span>
              <span className="text-[11px] text-[#666] mt-1.5 line-clamp-1 w-full">
                {svc.description.slice(0, 40)}...
              </span>
            </button>
          );
        })}
      </div>

      {/* Service Modal */}
      {selectedService && (
        <ServiceModal
          service={selectedService}
          colorIndex={selectedIndex}
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
