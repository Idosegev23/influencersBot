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
// Service icon mapping
// ---------------------------------------------------------------------------

const SERVICE_ICONS: Record<string, string> = {
  'Content Creation': 'edit_note',
  'SEO': 'travel_explore',
  'Paid Social Advertising': 'campaign',
  'Video Production': 'videocam',
  'Podcast Production': 'podcasts',
  'Performance Marketing / PPC': 'trending_up',
  'Social Media Management': 'share',
  'Television Advertising': 'tv',
  'Influencer Marketing': 'group',
};

const SERVICE_COLORS: string[] = [
  '#9334EB', '#2663EB', '#DC2627', '#EA580C',
  '#16A34A', '#0891B2', '#7C3AED', '#DB2777', '#CA8A04',
];

// ---------------------------------------------------------------------------
// Mini-Brief Form
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

  return (
    <div className="flex flex-col h-full">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 px-1">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                background: step >= s ? '#9334EB' : '#e5e7eb',
                color: step >= s ? '#fff' : '#6b7280',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span className="text-xs font-medium" style={{ color: step >= s ? '#111827' : '#9ca3af' }}>
              {s === 1 ? 'פרטים' : 'על הפרויקט'}
            </span>
            {s < 2 && <div className="flex-1 h-0.5 rounded" style={{ background: step > s ? '#9334EB' : '#e5e7eb' }} />}
          </div>
        ))}
      </div>

      {step === 1 ? (
        /* ── Step 1: Contact info ── */
        <div className="space-y-3 flex-1">
          <input
            type="text"
            placeholder="שם מלא *"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB] outline-none transition-colors"
            autoFocus
          />
          <input
            type="text"
            placeholder="שם העסק"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB] outline-none transition-colors"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="אימייל"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="px-4 py-3 rounded-xl text-sm border border-gray-200 focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB] outline-none transition-colors"
              style={{ direction: 'ltr' }}
            />
            <input
              type="tel"
              placeholder="טלפון"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className="px-4 py-3 rounded-xl text-sm border border-gray-200 focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB] outline-none transition-colors"
              style={{ direction: 'ltr' }}
            />
          </div>
        </div>
      ) : (
        /* ── Step 2: Project details ── */
        <div className="space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          <textarea
            placeholder="ספר/י בקצרה על המוצר או השירות שלך"
            value={form.productDescription}
            onChange={(e) => set('productDescription', e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB] outline-none transition-colors resize-none"
          />

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: '#374151' }}>מה המטרה העיקרית?</label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('goal', form.goal === g ? '' : g)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.goal === g ? '#9334EB' : '#e5e7eb',
                    background: form.goal === g ? 'rgba(147, 52, 235, 0.1)' : '#fff',
                    color: form.goal === g ? '#9334EB' : '#374151',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: '#374151' }}>תקציב משוער</label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set('budgetRange', form.budgetRange === b ? '' : b)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    borderColor: form.budgetRange === b ? '#9334EB' : '#e5e7eb',
                    background: form.budgetRange === b ? 'rgba(147, 52, 235, 0.1)' : '#fff',
                    color: form.budgetRange === b ? '#9334EB' : '#374151',
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
            className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:border-[#9334EB] focus:ring-1 focus:ring-[#9334EB] outline-none transition-colors resize-none"
          />
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100">
        {step === 1 ? (
          <>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={() => form.fullName.trim() && setStep(2)}
              disabled={!form.fullName.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40"
              style={{ background: '#9334EB' }}
            >
              המשך →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ← חזרה
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: '#9334EB' }}
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
// Service Detail Modal
// ---------------------------------------------------------------------------

function ServiceModal({
  service,
  colorIndex,
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
  const color = SERVICE_COLORS[colorIndex % SERVICE_COLORS.length];
  const icon = SERVICE_ICONS[service.name] || 'handshake';

  function handleAsk() {
    const question = `ספרו לי על שירות ${service.name}`;
    const context = `[הקשר השירות:]\nשם: ${service.name}\nתיאור: ${service.description}`;
    onAskAbout(question, context);
    onClose();
  }

  function handleBriefSubmitted(form: Record<string, string>) {
    setBriefSubmitted(true);
    // After 2s, send summary to chat and close
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ direction: 'rtl' }}
      >
        {/* Header */}
        <div className="p-5 pb-4 flex items-start gap-4" style={{ background: `linear-gradient(135deg, ${color}15, ${color}08)` }}>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}20` }}
          >
            <span className="material-symbols-outlined text-[24px]" style={{ color }}>{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900">{service.name}</h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{service.description}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[20px] text-gray-400">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto">
          {briefSubmitted ? (
            /* ── Success state ── */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#DCFCE8' }}>
                <span className="material-symbols-outlined text-[32px] text-green-600" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1">הבריף נשלח בהצלחה!</h4>
              <p className="text-sm text-gray-500">נחזור אליך בהקדם</p>
            </div>
          ) : showBrief ? (
            /* ── Mini-Brief Form ── */
            <MiniBriefForm
              service={service}
              accountId={accountId}
              sessionId={sessionId}
              onSubmitted={handleBriefSubmitted}
              onCancel={() => setShowBrief(false)}
            />
          ) : (
            /* ── CTA Buttons ── */
            <div className="space-y-3">
              <button
                onClick={handleAsk}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-[#9334EB] hover:bg-purple-50/50 transition-colors text-right"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#9334EB15' }}>
                  <span className="material-symbols-outlined text-[20px]" style={{ color: '#9334EB' }}>chat</span>
                </div>
                <div>
                  <span className="font-bold text-sm text-gray-900 block">שאל אותי על השירות</span>
                  <span className="text-xs text-gray-500">דברו איתנו בצ׳אט ונסביר הכל</span>
                </div>
              </button>

              {enableBrief && (
                <button
                  onClick={() => setShowBrief(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-right"
                  style={{ borderColor: '#9334EB', background: 'rgba(147, 52, 235, 0.04)' }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#9334EB20' }}>
                    <span className="material-symbols-outlined text-[20px]" style={{ color: '#9334EB' }}>description</span>
                  </div>
                  <div>
                    <span className="font-bold text-sm text-gray-900 block">השאר פרטים לבריף</span>
                    <span className="text-xs text-gray-500">מלא טופס קצר ונחזור אליך עם הצעה</span>
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
// Main Component — Services Grid
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
        // Filter only services
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
        <div className="w-6 h-6 border-2 border-[#9334EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        <span className="material-symbols-outlined text-[48px] mb-3 block">info</span>
        אין שירותים להצגה
      </div>
    );
  }

  return (
    <div className="px-3 py-4" style={{ direction: 'rtl' }}>
      {/* Header */}
      <div className="mb-5 px-1">
        <h2 className="text-lg font-bold text-gray-900">השירותים שלנו</h2>
        <p className="text-xs text-gray-500 mt-1">לחצו על שירות כדי לקבל מידע נוסף או להשאיר פרטים</p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {services.map((svc, i) => {
          const color = SERVICE_COLORS[i % SERVICE_COLORS.length];
          const icon = SERVICE_ICONS[svc.name] || 'handshake';
          return (
            <button
              key={svc.id}
              onClick={() => { setSelectedService(svc); setSelectedIndex(i); }}
              className="group flex flex-col items-center text-center p-4 rounded-2xl border border-gray-100 hover:border-transparent transition-all duration-200 hover:shadow-lg"
              style={{
                background: '#fff',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
                style={{ background: `${color}15` }}
              >
                <span className="material-symbols-outlined text-[24px]" style={{ color }}>{icon}</span>
              </div>
              <span className="text-sm font-semibold text-gray-800 leading-tight">{svc.name}</span>
              <span className="text-[11px] text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
                {svc.description.slice(0, 60)}...
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
