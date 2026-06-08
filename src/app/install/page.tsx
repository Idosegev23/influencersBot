'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

/* ==========================================================================
   BestieAI — Widget Install Guide (public, client-facing)
   Hebrew-first, RTL, warm light palette, no emojis. Material Symbols icons.
   Brand language mirrors /bestieai landing: warm white #faf9f7, stone text,
   indigo-500 accent, rounded-2xl cards, soft blurred blobs.

   Personalization (optional):
     /install?id=ACCOUNT_UUID&name=BrandName
   When `id` is present the snippet renders the real, copy-ready value and the
   page greets the specific client. Without it, a clearly-marked placeholder
   is shown.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Icon — Material Symbols Outlined (loaded globally in src/app/layout.tsx)
// ---------------------------------------------------------------------------

function Icon({ name, className = '', size = 22 }: { name: string; className?: string; size?: number }) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden
    >
      {name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const PLATFORMS = [
  {
    id: 'shopify',
    label: 'Shopify',
    icon: 'storefront',
    steps: [
      'בלוח הניהול: Online Store ← Themes',
      'ליד התבנית הפעילה: ⋯ ← Edit code',
      'פותחים את הקובץ theme.liquid (תחת Layout)',
      'מדביקים את הקוד רגע לפני תג הסגירה </body>',
      'לוחצים Save',
    ],
    note: 'אופציה ללא עריכת קוד: Settings ← Custom code / Footer scripts, ומדביקים שם.',
  },
  {
    id: 'wordpress',
    label: 'WordPress',
    icon: 'article',
    steps: [
      'מתקינים תוסף חינמי: WPCode או Insert Headers and Footers',
      'נכנסים להגדרות התוסף',
      'מדביקים את הקוד בשדה Footer (Body / Footer scripts)',
      'שומרים',
    ],
    note: 'ידני: עריכת footer.php של התבנית והדבקה לפני </body> — מומלץ דרך Child Theme כדי לא לאבד את השינוי בעדכון.',
  },
  {
    id: 'wix',
    label: 'Wix',
    icon: 'web',
    steps: [
      'בלוח הניהול: Settings ← Custom Code',
      'לוחצים + Add Custom Code',
      'מדביקים את הקוד ובוחרים Place Code in: Body – end',
      'מחילים על All pages ולוחצים Apply',
    ],
    note: null,
  },
  {
    id: 'squarespace',
    label: 'Squarespace',
    icon: 'grid_view',
    steps: [
      'נכנסים ל-Settings ← Advanced ← Code Injection',
      'מדביקים את הקוד בשדה Footer',
      'שומרים',
    ],
    note: null,
  },
  {
    id: 'custom',
    label: 'אתר מותאם / HTML',
    icon: 'code',
    steps: [
      'פותחים את קובץ ה-HTML של האתר',
      'מדביקים את הקוד רגע לפני תג הסגירה </body>',
      'אם יש תבנית משותפת (footer include) — מדביקים שם פעם אחת והווידג׳ט יופיע בכל העמודים',
      'מעלים את הקובץ לשרת',
    ],
    note: null,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InstallGuide() {
  const [origin, setOrigin] = useState('https://bestie.ldresgroup.com');
  const [accountId, setAccountId] = useState('YOUR_ACCOUNT_ID');
  const [clientName, setClientName] = useState<string | null>(null);
  const [hasId, setHasId] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('shopify');

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const name = params.get('name');
    if (id) {
      setAccountId(id);
      setHasId(true);
    }
    if (name) setClientName(name);
  }, []);

  const snippet = `<!-- BestieAI Widget -->\n<script src="${origin}/widget.js" data-account-id="${accountId}"></script>`;

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — user can still select manually */
    }
  }

  const active = PLATFORMS.find((p) => p.id === activeTab) ?? PLATFORMS[0];

  return (
    <main
      className="bg-white text-stone-900 antialiased min-h-screen"
      dir="rtl"
      style={{ fontFamily: "'Inter', 'Heebo', sans-serif" }}
    >
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap');
        .font-grotesk {
          font-family: 'Space Grotesk', 'Heebo', sans-serif;
        }
        html {
          scroll-behavior: smooth;
        }
      `}</style>

      {/* ---------------------------------------------------------------- Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-stone-200/60">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <Image src="/Logo.png" alt="BestieAI" width={130} height={36} className="h-8 w-auto" />
          </div>
          <a
            href="#help"
            className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            <Icon name="help" size={18} />
            צריכים עזרה?
          </a>
        </div>
      </nav>

      {/* -------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#faf9f7] via-white to-white">
        <div className="absolute top-10 right-1/4 w-[460px] h-[460px] bg-indigo-100/40 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-10 left-1/4 w-[360px] h-[360px] bg-amber-100/30 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 pt-16 pb-12 md:pt-24 md:pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs text-indigo-600 mb-7">
            <Icon name="bolt" size={14} className="text-indigo-500" />
            התקנה תוך דקה
          </div>

          <h1 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900 leading-[1.15] tracking-tight">
            {clientName ? (
              <>
                מתקינים את העוזר החכם
                <br />
                של <span className="text-indigo-500">{clientName}</span>
              </>
            ) : (
              <>
                מחברים את העוזר החכם
                <br />
                <span className="text-indigo-500">לאתר שלכם</span>
              </>
            )}
          </h1>

          <p className="mt-5 text-base md:text-lg text-stone-500 leading-relaxed max-w-xl mx-auto">
            הכל מתחיל בשורת קוד אחת. מדביקים אותה פעם אחת באתר — והעוזר החכם
            עולה לאוויר. בלי תוספים, בלי שינוי בקוד הקיים.
          </p>

          {/* Snippet card */}
          <div className="mt-10 text-right">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-stone-700">קוד ההטמעה</span>
              {hasId ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Icon name="verified" size={15} />
                  מותאם לחשבון שלכם
                </span>
              ) : (
                <span className="text-xs text-stone-400">דוגמה — נחליף את המזהה בשלכם</span>
              )}
            </div>

            <div className="relative rounded-2xl border border-stone-200 bg-stone-900 shadow-xl shadow-stone-200/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <button
                  onClick={copySnippet}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    copied
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Icon name={copied ? 'check' : 'content_copy'} size={15} />
                  {copied ? 'הועתק' : 'העתקת הקוד'}
                </button>
              </div>
              <pre
                dir="ltr"
                className="px-4 py-4 overflow-x-auto text-left text-[13px] leading-relaxed text-stone-200"
                style={{ fontFamily: "'Space Grotesk', ui-monospace, monospace" }}
              >
                <code>
                  <span className="text-stone-500">{'<!-- BestieAI Widget -->'}</span>
                  {'\n'}
                  <span className="text-sky-300">{'<script'}</span>{' '}
                  <span className="text-indigo-300">src</span>=
                  <span className="text-emerald-300">{`"${origin}/widget.js"`}</span>{' '}
                  <span className="text-indigo-300">data-account-id</span>=
                  <span className="text-amber-300">{`"${accountId}"`}</span>
                  <span className="text-sky-300">{'></script>'}</span>
                </code>
              </pre>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-stone-400">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="code_off" size={15} className="text-stone-400" />
                שורת קוד אחת
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="extension_off" size={15} className="text-stone-400" />
                בלי תוספים
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="lock_open" size={15} className="text-stone-400" />
                בלי גישה לקוד הקיים
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- 3 steps */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-grotesk text-2xl md:text-3xl font-bold text-stone-900 text-center">
            איך זה עובד, בשלושה צעדים
          </h2>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              {
                num: '01',
                icon: 'content_copy',
                title: 'מעתיקים את הקוד',
                desc: 'לוחצים על "העתקת הקוד" למעלה. זו אותה שורה לכל האתר.',
              },
              {
                num: '02',
                icon: 'integration_instructions',
                title: 'מדביקים לפני </body>',
                desc: 'מוסיפים את הקוד לתבנית האתר, רצוי בפוטר המשותף, כדי שיופיע בכל העמודים.',
              },
              {
                num: '03',
                icon: 'rocket_launch',
                title: 'שומרים — וזהו',
                desc: 'בועת הצ׳אט מופיעה אוטומטית. העיצוב, השפה והתוכן כבר מוגדרים מראש.',
              },
            ].map((s) => (
              <div
                key={s.num}
                className="relative bg-[#faf9f7] border border-stone-200 rounded-2xl p-7 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                    <Icon name={s.icon} size={22} />
                  </div>
                  <span className="font-grotesk text-4xl font-bold text-stone-100">{s.num}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-stone-900">{s.title}</h3>
                <p className="mt-2 text-sm text-stone-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Platform tabs */}
      <section className="bg-[#faf9f7] py-16 md:py-20 border-y border-stone-200/60">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-grotesk text-2xl md:text-3xl font-bold text-stone-900 text-center">
            הוראות לפי הפלטפורמה שלכם
          </h2>
          <p className="text-stone-500 text-center mt-3 text-sm">
            בוחרים את הפלטפורמה שעליה בנוי האתר — והולכים צעד אחר צעד.
          </p>

          {/* Tabs */}
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {PLATFORMS.map((p) => {
              const isActive = p.id === activeTab;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveTab(p.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
                    isActive
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-600 border-stone-200 hover:border-indigo-200 hover:text-stone-900'
                  }`}
                >
                  <Icon name={p.icon} size={18} className={isActive ? 'text-white' : 'text-indigo-400'} />
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Active platform steps */}
          <div className="mt-8 bg-white border border-stone-200 rounded-2xl p-7 md:p-9 shadow-sm">
            <div className="flex items-center gap-3 pb-5 border-b border-stone-100">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                <Icon name={active.icon} size={22} />
              </div>
              <h3 className="text-xl font-semibold text-stone-900">{active.label}</h3>
            </div>

            <ol className="mt-6 space-y-4">
              {active.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-stone-600 leading-relaxed pt-1">{step}</span>
                </li>
              ))}
            </ol>

            {active.note && (
              <div className="mt-6 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <Icon name="lightbulb" size={18} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900/80 leading-relaxed">{active.note}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Verify */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-gradient-to-br from-indigo-50/60 to-white border border-indigo-100 rounded-2xl p-8 md:p-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white border border-indigo-100 flex items-center justify-center text-indigo-500">
                <Icon name="visibility" size={22} />
              </div>
              <h2 className="font-grotesk text-2xl md:text-3xl font-bold text-stone-900">
                בדיקה שהכל עובד
              </h2>
            </div>

            <div className="mt-7 grid md:grid-cols-3 gap-5">
              {[
                {
                  icon: 'refresh',
                  title: 'פותחים את האתר',
                  desc: 'מרעננים רענון מלא (Ctrl/Cmd + Shift + R).',
                },
                {
                  icon: 'chat_bubble',
                  title: 'מאתרים את הבועה',
                  desc: 'בועת צ׳אט אמורה להופיע בפינת המסך.',
                },
                {
                  icon: 'send',
                  title: 'שולחים הודעה',
                  desc: 'לוחצים עליה ושולחים הודעת בדיקה — אמורה לחזור תשובה.',
                },
              ].map((c) => (
                <div key={c.title} className="bg-white border border-stone-200 rounded-xl p-5">
                  <Icon name={c.icon} size={22} className="text-indigo-500" />
                  <h3 className="mt-3 text-base font-semibold text-stone-900">{c.title}</h3>
                  <p className="mt-1.5 text-sm text-stone-500 leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- Troubleshooting */}
      <section id="help" className="bg-[#faf9f7] py-16 md:py-20 border-t border-stone-200/60">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-grotesk text-2xl md:text-3xl font-bold text-stone-900 text-center">
            משהו לא עובד?
          </h2>

          <div className="mt-10 space-y-3">
            {[
              {
                icon: 'visibility_off',
                problem: 'הבועה לא מופיעה',
                fix: 'ודאו שהקוד הודבק רגע לפני </body> ושהשינוי נשמר. רעננו רענון מלא.',
              },
              {
                icon: 'key_off',
                problem: 'הודעה: Missing data-account-id',
                fix: 'מזהה החשבון חסר או שגוי. ודאו שערך data-account-id הודבק במלואו, ללא רווחים.',
              },
              {
                icon: 'shield',
                problem: 'שגיאת אבטחה (CSP) ב-Console',
                fix: 'לאתר יש מדיניות Content Security Policy מחמירה. הוסיפו את הדומיין שלנו ל-script-src ול-connect-src. אם אינכם בטוחים שיש לכם CSP — כנראה שאין, ואפשר להתעלם.',
              },
            ].map((r) => (
              <div
                key={r.problem}
                className="flex items-start gap-4 bg-white border border-stone-200 rounded-2xl p-5 hover:border-indigo-200 transition-colors"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-400">
                  <Icon name={r.icon} size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">{r.problem}</h3>
                  <p className="mt-1 text-sm text-stone-500 leading-relaxed">{r.fix}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CSP detail */}
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs text-stone-400">
              להוספה ל-Content Security Policy (רק אם רלוונטי)
            </div>
            <pre
              dir="ltr"
              className="px-4 py-4 overflow-x-auto text-left text-[13px] leading-relaxed text-stone-200"
              style={{ fontFamily: "'Space Grotesk', ui-monospace, monospace" }}
            >
              <code>
                <span className="text-indigo-300">script-src</span>{'  ... '}
                <span className="text-emerald-300">{origin}</span>;{'\n'}
                <span className="text-indigo-300">connect-src</span>{' ... '}
                <span className="text-emerald-300">{origin}</span>;
              </code>
            </pre>
          </div>

          {/* Contact */}
          <div className="mt-10 text-center bg-white border border-stone-200 rounded-2xl p-8">
            <div className="w-14 h-14 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-500">
              <Icon name="support_agent" size={28} />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-stone-900">אנחנו כאן לעזור</h3>
            <p className="mt-2 text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
              נתקעתם? שלחו לנו צילום מסך והדומיין של האתר — ונסגור את זה במהירות.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Footer */}
      <footer className="bg-white border-t border-stone-200 py-10">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/Logo.png" alt="BestieAI" width={110} height={30} className="h-6 w-auto" />
            <span className="text-stone-400 text-sm">by LDRS Group</span>
          </div>
          <p className="text-stone-400 text-xs">&copy; 2026 BestieAI. כל הזכויות שמורות.</p>
        </div>
      </footer>
    </main>
  );
}
