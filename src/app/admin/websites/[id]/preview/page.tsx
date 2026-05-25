'use client';

/**
 * Website preview — admin sees the customer's actual site with our REAL
 * widget.js running on top. Powered by /api/widget/preview/[accountId]
 * which fetches the customer's HTML server-side, strips iframe-blocking
 * headers, injects <base href> + the widget script tag, and returns a
 * page our iframe can render.
 *
 * Why this beats reimplementing the widget in React: single source of
 * truth (public/widget.js). Every feature ships to preview automatically.
 * Page context, locale, modules, dark mode, ratings, transcript — same
 * code path as a real visitor. No drift.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SiteSummary {
  domain: string;
  displayName: string;
  url: string;
  language: 'he' | 'en';
  enabled: boolean;
  modules: { support: { enabled: boolean }; leads: { enabled: boolean }; bookings: { enabled: boolean } };
  productsCount: number;
  chunksCount: number;
  pagesCount: number;
  primaryColor: string;
}

export default function WebsitePreviewPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [site, setSite] = useState<SiteSummary | null>(null);
  const [path, setPath] = useState('/');
  const [pathInput, setPathInput] = useState('/');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [infoOpen, setInfoOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // bump to force reload
  const [copied, setCopied] = useState<'snippet' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/websites');
        if (res.ok) {
          const data = await res.json();
          const found = (data.websites || []).find((w: any) => w.id === accountId);
          if (found) setSite(found);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  const previewSrc = `/api/widget/preview/${accountId}?path=${encodeURIComponent(path)}&_v=${iframeKey}`;

  const handleNavigate = useCallback(() => {
    const next = pathInput.startsWith('/') ? pathInput : '/' + pathInput;
    setPath(next);
    setIframeKey((k) => k + 1);
  }, [pathInput]);

  const handleReload = () => setIframeKey((k) => k + 1);

  const handleCopySnippet = () => {
    const snippet = `<!-- bestieAI Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${accountId}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopied('snippet');
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-[#2663EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[#1f2937] mb-2">אתר לא נמצא</h2>
          <Link href="/admin/websites" className="text-[#2663EB] underline">חזרה לרשימה</Link>
        </div>
      </div>
    );
  }

  // ---- Device frame sizing ----
  // Desktop: full available area (fluid)
  // Mobile: 390×844 (iPhone 14) centered with device chrome
  const frameStyle: React.CSSProperties = device === 'mobile'
    ? { width: 390, height: 844, borderRadius: 36, boxShadow: '0 0 0 12px #1f1f1f, 0 24px 48px rgba(0,0,0,0.18)', overflow: 'hidden' }
    : { width: '100%', height: '100%', borderRadius: 0 };

  return (
    <>
      {/* ============ Top Toolbar ============ */}
      <div
        className="flex-shrink-0 flex items-center justify-between gap-3 px-5 z-20 bg-white"
        style={{ height: 60, boxShadow: '0 1px 8px rgba(55,50,38,0.06)', direction: 'rtl' }}
      >
        {/* Right (RTL): back + brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href="/admin/websites" className="neon-pill-outline flex items-center gap-1.5 px-4 py-2 text-sm">
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            חזרה
          </Link>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-[#1f2937] text-sm" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {site.displayName}
            </span>
            <span className="text-[11px] text-[#9ca3af] font-mono">{site.domain}</span>
          </div>
        </div>

        {/* Middle: URL bar — type path, hit Enter to navigate within site */}
        <div className="flex-1 max-w-xl mx-4">
          <div className="flex items-center bg-[#f4f5f7] rounded-full border border-[#e5e7eb] focus-within:border-[#2663EB] focus-within:bg-white transition-colors">
            <span className="ps-3 pe-1.5 text-[11px] text-[#9ca3af] font-mono whitespace-nowrap">{site.domain}</span>
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
              placeholder="/products/example"
              dir="ltr"
              className="flex-1 bg-transparent outline-none py-2 px-2 text-sm font-mono text-[#1f2937] min-w-0"
            />
            <button
              onClick={handleNavigate}
              className="me-1 px-3 py-1 text-xs font-medium text-[#2663EB] hover:bg-[#2663EB]/10 rounded-full transition-colors"
              title="טען עמוד"
            >
              עבור
            </button>
          </div>
        </div>

        {/* Left (RTL): actions + device toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleReload}
            className="neon-pill-outline flex items-center justify-center w-9 h-9 !px-0"
            title="טען מחדש"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>

          <button
            onClick={() => setInfoOpen(!infoOpen)}
            className={`neon-pill-outline flex items-center gap-1.5 px-4 py-2 text-sm ${infoOpen ? '!bg-[#2663EB]/15 !border-[#2663EB]' : ''}`}
          >
            <span className="material-symbols-outlined text-[18px]">info</span>
            פרטים
          </button>

          <button
            onClick={handleCopySnippet}
            className="neon-pill-outline flex items-center gap-1.5 px-4 py-2 text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">
              {copied === 'snippet' ? 'check' : 'code'}
            </span>
            {copied === 'snippet' ? 'הועתק' : 'העתק קוד הטמעה'}
          </button>

          <a
            href={`https://${site.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="neon-pill-outline flex items-center gap-1.5 px-4 py-2 text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            פתח אתר
          </a>

          <div className="flex items-center gap-1 ms-2">
            <button
              onClick={() => setDevice('desktop')}
              className={`neon-pill-outline flex items-center justify-center w-9 h-9 !px-0 ${device === 'desktop' ? '!bg-[#2663EB]/20 !border-[#2663EB] !text-[#2663EB]' : ''}`}
              title="דסקטופ"
            >
              <span className="material-symbols-outlined text-[20px]">monitor</span>
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`neon-pill-outline flex items-center justify-center w-9 h-9 !px-0 ${device === 'mobile' ? '!bg-[#2663EB]/20 !border-[#2663EB] !text-[#2663EB]' : ''}`}
              title="מובייל"
            >
              <span className="material-symbols-outlined text-[20px]">smartphone</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============ Main canvas + side info panel ============ */}
      <div
        className="flex overflow-hidden relative"
        style={{ height: 'calc(100vh - 60px)', background: '#f4f5f7' }}
        dir="rtl"
      >
        {/* Info Panel (collapsible) */}
        <div
          className="flex-shrink-0 bg-white overflow-y-auto transition-all duration-300 ease-in-out"
          style={{
            width: infoOpen ? 320 : 0,
            opacity: infoOpen ? 1 : 0,
            borderLeft: infoOpen ? '1px solid rgba(55,50,38,0.08)' : 'none',
          }}
        >
          {infoOpen && (
            <div className="p-5 space-y-5" style={{ width: 320 }}>
              <h3 className="text-base font-semibold text-[#1f2937]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                סטטוס
              </h3>

              <Field label="מצב">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${site.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${site.enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  {site.enabled ? 'פעיל' : 'כבוי'}
                </span>
              </Field>

              <Field label="שפה">{site.language === 'en' ? 'English' : 'עברית'}</Field>

              <Field label="מודולים">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { on: site.modules.support.enabled, label: 'תמיכה' },
                    { on: site.modules.leads.enabled, label: 'לידים' },
                    { on: site.modules.bookings.enabled, label: 'פגישות' },
                  ].map((m, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded ${m.on ? 'bg-[#2663EB]/10 text-[#2663EB]' : 'bg-gray-100 text-gray-400 line-through'}`}>{m.label}</span>
                  ))}
                </div>
              </Field>

              <Field label="קטלוג">
                {site.productsCount > 0
                  ? <span className="text-[#1f2937]">{site.productsCount.toLocaleString()} מוצרים</span>
                  : <span className="text-gray-400">ללא קטלוג</span>}
              </Field>

              <Field label="בסיס ידע">
                {site.chunksCount.toLocaleString()} chunks ({site.pagesCount} מסמכים)
              </Field>

              <Field label="צבע ראשי">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded border border-[#e5e7eb]" style={{ background: site.primaryColor }} />
                  <span className="font-mono text-xs text-[#1f2937]">{site.primaryColor}</span>
                </div>
              </Field>

              <div className="pt-3 border-t border-[#e5e7eb]">
                <Link
                  href={`/admin/websites`}
                  className="text-xs text-[#2663EB] hover:underline"
                >
                  ערוך הגדרות חשבון →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Iframe canvas — the customer's actual site with our real widget.js on top */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
          <div style={frameStyle} className="bg-white">
            <iframe
              key={iframeKey}
              src={previewSrc}
              title={`Preview — ${site.displayName}`}
              className="w-full h-full"
              style={{ border: 'none', display: 'block' }}
              // sandbox left open so widget.js can use localStorage, fetch our API, etc.
              // We control the proxied HTML; widget script is added by US, not by the customer.
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-[#9ca3af] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-[#1f2937]">{children}</div>
    </div>
  );
}
