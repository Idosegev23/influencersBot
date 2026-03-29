'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  product_url?: string;
}

interface ServicesCatalogTabProps {
  accountId: string;
  onAskAbout: (question: string, hiddenContext?: string) => void;
  sessionId?: string | null;
  enableBrief?: boolean;
}

// ---------------------------------------------------------------------------
// Service icon mapping (Stitch design uses white monochrome icons)
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
};

// ---------------------------------------------------------------------------
// Mini-Brief Form (dark theme)
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

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  async function handleSubmit() {
    if (!form.fullName.trim()) return;
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
    'w-full px-4 py-3 rounded-xl text-sm bg-[#1A1A1A] border border-[#333] text-white placeholder-[#666] focus:border-white focus:ring-1 focus:ring-white outline-none transition-colors';

  return (
    <div className="flex flex-col h-full">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 px-1">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                background: step >= s ? '#fff' : '#333',
                color: step >= s ? '#000' : '#666',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span className="text-xs font-medium" style={{ color: step >= s ? '#fff' : '#666' }}>
              {s === 1 ? 'פרטים' : 'על הפרויקט'}
            </span>
            {s < 2 && <div className="flex-1 h-0.5 rounded" style={{ background: step > s ? '#fff' : '#333' }} />}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-3 flex-1">
          <input
            type="text"
            placeholder="שם מלא *"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            className={inputClasses}
            autoFocus
          />
          <input
            type="text"
            placeholder="שם העסק"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            className={inputClasses}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="אימייל"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={inputClasses}
              style={{ direction: 'ltr' }}
            />
            <input
              type="tel"
              placeholder="טלפון"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={inputClasses}
              style={{ direction: 'ltr' }}
            />
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
            <label className="block text-xs font-semibold mb-2 text-[#A3A3A3]">מה המטרה העיקרית?</label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('goal', form.goal === g ? '' : g)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.goal === g ? '#fff' : '#333',
                    background: form.goal === g ? 'rgba(255, 255, 255, 0.1)' : '#1A1A1A',
                    color: form.goal === g ? '#fff' : '#A3A3A3',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 text-[#A3A3A3]">תקציב משוער</label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('budgetRange', form.budgetRange === b ? '' : b)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.budgetRange === b ? '#fff' : '#333',
                    background: form.budgetRange === b ? 'rgba(255, 255, 255, 0.1)' : '#1A1A1A',
                    color: form.budgetRange === b ? '#fff' : '#A3A3A3',
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
      <div className="flex gap-3 mt-4 pt-3 border-t border-[#262626]">
        {step === 1 ? (
          <>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#262626] text-[#A3A3A3] hover:bg-[#333] transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={() => form.fullName.trim() && setStep(2)}
              disabled={!form.fullName.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              המשך →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#262626] text-[#A3A3A3] hover:bg-[#333] transition-colors"
            >
              ← חזרה
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-gray-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
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
// Service Detail Modal (dark theme)
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

  function handleAsk() {
    const question = `ספרו לי על שירות ${service.name}`;
    const context = `[הקשר השירות:]\nשם: ${service.name}\nתיאור: ${service.description}`;
    onAskAbout(question, context);
    onClose();
  }

  function handleBriefSubmitted(form: Record<string, string>) {
    setBriefSubmitted(true);
    setTimeout(() => {
      const question = `שלחתי בריף לגבי ${service.name}`;
      const context = `[בריף שנשלח:]\nשירות: ${service.name}\nשם: ${form.fullName}\nעסק: ${form.businessName || 'לא צוין'}\nמטרה: ${form.goal || 'לא צוינה'}\nתקציב: ${form.budgetRange || 'לא צוין'}`;
      onAskAbout(question, context);
      onClose();
    }, 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md max-h-[90vh] bg-[#111111] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ direction: 'rtl' }}
      >
        {/* Header */}
        <div className="p-5 pb-4 flex items-start gap-4 bg-[#1A1A1A]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10">
            <span className="material-symbols-outlined text-[24px] text-white">{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white">{service.name}</h3>
            <p className="text-sm text-[#A3A3A3] mt-1 leading-relaxed">{service.description}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[20px] text-[#666]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto">
          {briefSubmitted ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-white/10">
                <span className="material-symbols-outlined text-[32px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <h4 className="text-lg font-bold text-white mb-1">הבריף נשלח בהצלחה!</h4>
              <p className="text-sm text-[#737373]">נחזור אליך בהקדם</p>
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
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-[#262626] hover:border-[#404040] bg-[#1A1A1A] hover:bg-[#222] transition-all text-right"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10">
                  <span className="material-symbols-outlined text-[20px] text-white">chat</span>
                </div>
                <div>
                  <span className="font-bold text-sm text-white block">שאל אותי על השירות</span>
                  <span className="text-xs text-[#737373]">דברו איתנו בצ׳אט ונסביר הכל</span>
                </div>
              </button>

              {enableBrief && (
                <button
                  onClick={() => setShowBrief(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 transition-all text-right"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white/15">
                    <span className="material-symbols-outlined text-[20px] text-white">description</span>
                  </div>
                  <div>
                    <span className="font-bold text-sm text-white block">השאר פרטים לבריף</span>
                    <span className="text-xs text-[#737373]">מלא טופס קצר ונחזור אליך עם הצעה</span>
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
// Main Component — Services Grid (dark theme per Stitch design)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 text-[#737373] text-sm">
        <span className="material-symbols-outlined text-[48px] mb-3 block">info</span>
        אין שירותים להצגה
      </div>
    );
  }

  return (
    <div className="px-4 py-5" style={{ direction: 'rtl' }}>
      {/* Header */}
      <div className="mb-6 text-right">
        <h2 className="text-[18px] font-bold text-white">השירותים שלנו</h2>
        <p className="text-[12px] text-[#737373] mt-1">פתרונות דיגיטליים מותאמים לצמיחה שלכם</p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-3 gap-3">
        {services.map((svc, i) => {
          const icon = SERVICE_ICONS[svc.name] || 'handshake';
          return (
            <button
              key={svc.id}
              onClick={() => { setSelectedService(svc); setSelectedIndex(i); }}
              className="group flex flex-col items-center text-center p-4 rounded-2xl border border-[#262626] bg-[#1A1A1A] hover:border-[#404040] transition-all duration-200 active:scale-[0.98]"
              style={{ boxShadow: 'none' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-white/10 transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-[24px] text-white">{icon}</span>
              </div>
              <span className="text-[13px] font-bold text-white leading-tight">{svc.name}</span>
              <span className="text-[11px] text-[#737373] mt-1.5 line-clamp-1 w-full">
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
