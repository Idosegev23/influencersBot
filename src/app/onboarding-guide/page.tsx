'use client';

import { useState } from 'react';
import Image from 'next/image';

/* ==========================================================================
   BestieAI — Onboarding Requirements Landing Page
   Mirrors the BestieAI brand: warm white bg, stone text, indigo accent,
   subtle peach/amber tones. Hebrew RTL, no emojis.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-stone-200/60">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
        <a href="#hero" className="flex items-center">
          <Image src="/Logo.png" alt="BestieAI" width={140} height={40} className="h-8 w-auto" />
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm text-stone-500">
          <a href="#required" className="hover:text-stone-900 transition-colors">חובה</a>
          <a href="#recommended" className="hover:text-stone-900 transition-colors">מומלץ</a>
          <a href="#optional" className="hover:text-stone-900 transition-colors">אופציונלי</a>
          <a href="#process" className="hover:text-stone-900 transition-colors">התהליך</a>
        </div>

        <a
          href="#form"
          className="hidden md:inline-flex px-5 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
        >
          התחילו אונבורדינג
        </a>

        <button className="md:hidden text-stone-600" onClick={() => setOpen(!open)}>
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-stone-100 px-6 py-4 space-y-3">
          <a href="#required" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">חובה</a>
          <a href="#recommended" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">מומלץ</a>
          <a href="#optional" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">אופציונלי</a>
          <a href="#process" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">התהליך</a>
          <a href="#form" onClick={() => setOpen(false)} className="block text-stone-900 font-semibold text-sm">התחילו אונבורדינג</a>
        </div>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section id="hero" className="relative min-h-screen flex items-center pt-16 overflow-hidden bg-gradient-to-b from-[#faf9f7] via-white to-white">
      {/* Soft warm blobs */}
      <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-indigo-100/40 rounded-full blur-[120px]" />
      <div className="absolute bottom-10 left-1/4 w-[400px] h-[400px] bg-amber-100/30 rounded-full blur-[100px]" />

      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-16 items-center">
        {/* Right side — copy (RTL) */}
        <div className="text-right" dir="rtl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs text-indigo-600 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            צ'ק־ליסט אונבורדינג רשמי
          </div>

          <h1 className="font-grotesk text-4xl md:text-5xl lg:text-6xl font-bold text-stone-900 leading-[1.1] tracking-tight">
            רגע לפני שהבוט שלכם<br />
            <span className="text-indigo-500">עולה לאוויר</span>
          </h1>

          <p className="mt-6 text-lg text-stone-500 leading-relaxed max-w-lg">
            בלי גישה לסיסמאות. בלי גישת אדמין לאתר. רק כמה פרטים פשוטים
            שיגרמו לבוט להכיר אתכם, לדבר בשפה שלכם, ולעבוד טוב מהיום הראשון.
          </p>

          <div className="flex flex-wrap gap-4 mt-10 justify-start">
            <a
              href="#form"
              className="px-7 py-3.5 rounded-full bg-stone-900 text-white font-semibold text-sm hover:bg-stone-800 transition-colors"
            >
              התחילו אונבורדינג
            </a>
            <a
              href="#required"
              className="px-7 py-3.5 rounded-full border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
            >
              ראו מה צריך
            </a>
          </div>

          <p className="mt-5 text-xs text-stone-400">
            הקמת חשבון מלא לוקחת 24–48 שעות מרגע קבלת הפרטים.
          </p>
        </div>

        {/* Left side — checklist mockup */}
        <div className="relative hidden md:block">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-100/30 to-transparent rounded-3xl blur-2xl" />
          <div className="relative bg-white rounded-3xl border border-stone-200 p-6 shadow-xl shadow-stone-200/50" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              </div>
              <div>
                <p className="text-stone-900 text-sm font-semibold">צ'ק־ליסט אונבורדינג</p>
                <p className="text-stone-400 text-xs">@ldrs_group</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                פעיל
              </div>
            </div>

            {/* Items */}
            <div className="mt-5 space-y-3 text-sm">
              {[
                { label: 'שם משתמש באינסטגרם', done: true },
                { label: 'סוג חשבון Business / Creator', done: true },
                { label: 'הסכמה לסריקת תוכן ציבורי', done: true },
                { label: 'כתובת אתר ופלטפורמה', done: true },
                { label: 'לוגו וצבעי מותג', done: false },
                { label: 'FAQ ונושאים אסורים', done: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    item.done ? 'bg-emerald-100 border border-emerald-200' : 'bg-stone-50 border border-stone-200'
                  }`}>
                    {item.done && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`flex-1 ${item.done ? 'text-stone-700' : 'text-stone-400'}`}>{item.label}</span>
                  {item.done && <span className="text-xs text-emerald-600 font-medium">קיבלנו</span>}
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs">
              <span className="text-stone-400">4 מתוך 6 הושלמו</span>
              <div className="flex-1 mx-3 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{ width: '66%' }} />
              </div>
              <span className="text-indigo-500 font-semibold">66%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Numbers strip
// ---------------------------------------------------------------------------

function Numbers() {
  const stats = [
    { value: '6', label: 'פרטי חובה' },
    { value: '24–48h', label: 'עד שהבוט באוויר' },
    { value: '0', label: 'גישות אדמין דרושות' },
    { value: '3', label: 'שפות נתמכות' },
  ];

  return (
    <section className="border-y border-stone-200/60 bg-[#faf9f7]">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8" dir="rtl">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-grotesk text-3xl md:text-4xl font-bold text-stone-900">{s.value}</p>
            <p className="text-sm text-stone-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Required Section
// ---------------------------------------------------------------------------

function Required() {
  const blocks = [
    {
      tag: '01',
      title: 'פרטי אינסטגרם',
      subtitle: 'בלי זה אי אפשר להתחיל לסרוק',
      items: [
        { label: 'שם משתמש (handle)', detail: 'לדוגמה @ldrs_group — בלי הכוכבית, רק ה־username.' },
        { label: 'סוג חשבון', detail: 'חייב להיות Business או Creator. Personal לא נתמך על־ידי ה־API.' },
        { label: 'חשבון ציבורי', detail: 'אם החשבון Private — אנחנו לא נוכל לסרוק תוכן.' },
      ],
    },
    {
      tag: '02',
      title: 'הסכמה לסריקה',
      subtitle: 'אישור פורמלי לפני שמתחילים',
      items: [
        { label: 'אישור בעל החשבון', detail: 'בעל/ת החשבון מאשר/ת סריקה של תוכן ציבורי — פוסטים, ביו, היילייטס.' },
        { label: 'זכויות תוכן', detail: 'אישור שהתוכן שמוצג לא מפר זכויות יוצרים של צד שלישי.' },
      ],
    },
  ];

  return (
    <section id="required" className="bg-white py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-xs text-rose-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            חובה
          </span>
          <h2 className="mt-5 font-grotesk text-3xl md:text-5xl font-bold text-stone-900">
            המינימום שצריך כדי להתחיל
          </h2>
          <p className="text-stone-500 mt-4">
            שני בלוקים פשוטים. בלעדיהם הסריקה לא יוצאת לדרך — איתם אנחנו עפים.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-2 gap-6">
          {blocks.map((b) => (
            <div
              key={b.tag}
              className="bg-[#faf9f7] border border-stone-200 rounded-2xl p-8 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <span className="font-grotesk text-5xl font-bold text-stone-100">{b.tag}</span>
                <span className="text-xs text-rose-500 font-semibold mt-3">חובה</span>
              </div>
              <h3 className="mt-2 text-xl font-semibold text-stone-900">{b.title}</h3>
              <p className="text-sm text-stone-400 mt-1">{b.subtitle}</p>

              <ul className="mt-6 space-y-4">
                {b.items.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-stone-800">{item.label}</p>
                      <p className="text-xs text-stone-500 mt-1 leading-relaxed">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recommended Section
// ---------------------------------------------------------------------------

function Recommended() {
  const blocks = [
    {
      title: 'אתר אינטרנט',
      subtitle: 'אם רוצים widget באתר',
      points: [
        { k: 'URL מלא', v: 'לדוגמה https://ldrsgroup.com' },
        { k: 'פלטפורמה', v: 'Shopify / WordPress / קוסטום. Shopify עובד הכי חלק — sitemap מובנה.' },
        { k: 'דומיינים נוספים', v: 'subdomains כמו shop.brand.co.il צריכים להיכלל ב־CSP.' },
        { k: 'נגישות לבוטים', v: 'robots.txt מאפשר crawl, ואין WAF/Cloudflare שיחסום.' },
      ],
    },
    {
      title: 'זהות מותג',
      subtitle: 'לעיצוב הצ׳אט והווידג׳ט',
      points: [
        { k: 'לוגו', v: 'SVG או PNG עם רקע שקוף — לאווטאר ולווידג׳ט.' },
        { k: 'צבעים', v: 'Hex codes לצבע ראשי וצבע משני.' },
        { k: 'טון דיבור', v: 'מקצועי? משועשע? יוקרתי? מי הקהל?' },
      ],
    },
    {
      title: 'תוכן עסקי',
      subtitle: 'מה הבוט צריך לדעת מעבר לאינסטגרם',
      points: [
        { k: 'מוצרים / שירותים', v: 'CSV / Sheets — בעיקר אם לא Shopify או יש פריטים שלא באתר.' },
        { k: 'קופונים פעילים', v: 'קוד + הנחה + מותגים שזה תקף עבורם.' },
        { k: 'שותפויות', v: 'מותגים שאתם משתפים פעולה איתם — להעצמת הצ׳אט.' },
        { k: 'FAQ קיים', v: 'שאלות נפוצות + התשובות — חוסך לבוט להמציא.' },
      ],
    },
    {
      title: 'הוראות פרסונה',
      subtitle: 'מה לומר ומה לא',
      points: [
        { k: 'נושאים אסורים', v: 'מתחרים, פוליטיקה, נושאים רגישים — מה לא להזכיר.' },
        { k: 'נושאי פוקוס', v: 'איפה להעמיק — מוצר ספציפי, קטגוריה חדשה.' },
        { k: 'הצגה עצמית', v: 'עוזר? נציגת מותג? יועצת מקצועית?' },
        { k: 'הצהרת אחריות', v: 'דרושה הצהרה משפטית לפני המלצות בריאות / רפואה?' },
      ],
    },
  ];

  return (
    <section id="recommended" className="bg-[#faf9f7] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-xs text-amber-700 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            מאוד מומלץ
          </span>
          <h2 className="mt-5 font-grotesk text-3xl md:text-5xl font-bold text-stone-900">
            ככל שתעבירו יותר — הבוט יהיה חכם יותר
          </h2>
          <p className="text-stone-500 mt-4">
            כל פרט שמגיע מצד הלקוח חוסך לבוט להמציא ומקרב אותנו לחוויה אישית באמת.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-2 gap-6">
          {blocks.map((b) => (
            <div
              key={b.title}
              className="bg-white border border-stone-200 rounded-2xl p-8 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-semibold text-stone-900">{b.title}</h3>
                <span className="text-xs text-amber-600 font-medium">מומלץ</span>
              </div>
              <p className="text-sm text-stone-400 mt-1">{b.subtitle}</p>

              <dl className="mt-6 space-y-4">
                {b.points.map((p) => (
                  <div key={p.k} className="grid grid-cols-[110px_1fr] gap-3 items-start">
                    <dt className="text-sm font-semibold text-stone-700 pt-0.5">{p.k}</dt>
                    <dd className="text-sm text-stone-500 leading-relaxed border-r border-stone-100 pr-3">{p.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Optional Section + Highlights tip
// ---------------------------------------------------------------------------

function Optional() {
  const items = [
    {
      title: 'Lead Capture',
      desc: 'מטרה ברורה: טלפון, אימייל, תיאום פגישה או קישור לרכישה. CRM יעד (Make.com / Zapier / Webhook ישיר / Gmail) ושדות חובה בטופס — שם, טלפון, צרכים.',
    },
    {
      title: 'אנליטיקס ודשבורד',
      desc: 'אימייל לדוח שבועי, ערוץ התראות (Slack או אימייל), והגדרה אילו אירועים שווים פינג בזמן אמת — lead caught? hot conversation?',
    },
    {
      title: 'תוכן נוסף לבוט',
      desc: 'PDF־ים פנימיים, מדריכי שימוש, תקנון, בלוג, מאמרים, קישורים ל־YouTube (יתומללו אוטומטית). תוכן בעברית ואנגלית במקביל אם רלוונטי.',
    },
  ];

  return (
    <section id="optional" className="bg-white py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs text-indigo-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            אופציונלי
          </span>
          <h2 className="mt-5 font-grotesk text-3xl md:text-5xl font-bold text-stone-900">
            השדרוגים שלוקחים את הבוט לרמה הבאה
          </h2>
          <p className="text-stone-500 mt-4">
            לא חובה. אבל אם זה רלוונטי — שווה להעביר עכשיו, חוסך הקמה כפולה אחר כך.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.title}
              className="bg-[#faf9f7] border border-stone-200 rounded-2xl p-6 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50/50 transition-all"
            >
              <h3 className="text-lg font-semibold text-stone-900">{item.title}</h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Highlights callout */}
        <div className="mt-16 bg-gradient-to-br from-amber-50 via-white to-indigo-50/30 border border-amber-200/60 rounded-2xl p-8 md:p-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-700">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-stone-900">Highlights — חשוב לדעת</h3>
              <p className="mt-2 text-sm text-stone-600 leading-relaxed">
                Instagram חוסם תוכן highlights באופן שרירותי לחשבונות עסקיים מסוימים. אין הגדרה ידנית
                להפעיל את זה — האלגוריתם מחליט לפי ותק החשבון, אקטיביות והיסטוריה.
                כדי לשפר את הסיכוי שה־highlights ייטענו בסריקה הראשונה:
              </p>

              <ul className="mt-5 space-y-2.5 text-sm text-stone-600">
                {[
                  'פעילות סדירה ב־Stories — לפחות פעם בשבוע.',
                  'highlights עם תכנים שיוצרו לאחרונה — Instagram מעדיף content מהחודש האחרון.',
                  'חשבון שלא דורש review מ־Meta (לכבות "Restricted access" אם קיים).',
                ].map((tip) => (
                  <li key={tip} className="flex gap-2">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-5 text-xs text-stone-500 italic border-r-2 border-amber-300 pr-3">
                אם ה־highlights לא נטענים בסריקה הראשונה — לרוב יעבדו אחרי 2–3 חודשים של פעילות גוברת.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What we DON'T need
// ---------------------------------------------------------------------------

function DontNeed() {
  const items = [
    { k: 'סיסמת אינסטגרם', v: 'אנחנו לא משתמשים ב־auth scraping. רק תוכן ציבורי.' },
    { k: 'גישת אדמין לאתר', v: 'סורקים רק מה שגלוי לכל גולש רגיל.' },
    { k: 'API tokens ידניים', v: 'כל הצד הטכני מטופל אצלנו — אתם לא נוגעים בקוד.' },
    { k: 'גישה לשרתים', v: 'הבוט והווידג׳ט רצים על תשתית Vercel שלנו.' },
  ];

  return (
    <section className="bg-stone-900 py-24 md:py-32 relative overflow-hidden">
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px]" />

      <div className="relative max-w-4xl mx-auto px-6" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-stone-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            מה אנחנו לא צריכים
          </span>
          <h2 className="mt-5 font-grotesk text-3xl md:text-5xl font-bold text-white">
            ואלה הדברים שלא תצטרכו לתת
          </h2>
          <p className="text-stone-400 mt-4">
            אבטחה ופרטיות הם דרישת בסיס. אם מישהו מבקש מכם את אלה — סימן לדאגה.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.k}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-rose-400">
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{item.k}</p>
                  <p className="text-stone-400 text-xs mt-1.5 leading-relaxed">{item.v}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What happens without details (table)
// ---------------------------------------------------------------------------

function Consequences() {
  const rows = [
    { missing: 'URL אתר', impact: 'אין widget — רק עמוד צ׳אט עצמאי.' },
    { missing: 'לוגו וצבעים', impact: 'משתמשים בברירות מחדל גנריות — פחות מיתוג.' },
    { missing: 'FAQ', impact: 'הבוט מסיק תשובות מהפוסטים — פחות מדויק בשאלות נפוצות.' },
    { missing: 'נושאים אסורים', impact: 'הבוט עלול להיכנס לטריטוריות לא רצויות.' },
    { missing: 'רשימת מוצרים', impact: 'הבוט יודע רק מה שהאתר חושף — חלק מהמוצרים יחסר.' },
    { missing: 'highlights פעילים', impact: 'אין תוכן story־based בבוט (לרוב לא קריטי).' },
    { missing: 'קופונים', impact: 'הבוט לא ימליץ על דילים פעילים בזמן אמת.' },
  ];

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="max-w-4xl mx-auto px-6" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900">
            ומה קורה אם משהו חסר?
          </h2>
          <p className="text-stone-500 mt-4">
            הבוט עדיין יעבוד. אבל זה מה שתפסידו על כל פרט שלא יגיע.
          </p>
        </div>

        <div className="mt-12 bg-[#faf9f7] border border-stone-200 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[180px_1fr] px-6 py-4 border-b border-stone-200 text-xs text-stone-400 font-medium">
            <span>אם חסר</span>
            <span>מה קורה</span>
          </div>

          {rows.map((r, i) => (
            <div
              key={r.missing}
              className={`grid grid-cols-[180px_1fr] px-6 py-4 text-sm ${
                i < rows.length - 1 ? 'border-b border-stone-100' : ''
              }`}
            >
              <span className="text-stone-700 font-semibold">{r.missing}</span>
              <span className="text-stone-500 leading-relaxed">{r.impact}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Process timeline
// ---------------------------------------------------------------------------

function Process() {
  const steps = [
    {
      num: '01',
      title: 'יצירת חשבון',
      desc: 'יוצרים בעלות UUID חדש ב־DB ומסנכרנים את כל ההגדרות הראשוניות מהפרטים שהתקבלו.',
    },
    {
      num: '02',
      title: 'סריקת אינסטגרם',
      desc: 'פרופיל, פוסטים, highlights metadata, ותמלולים אוטומטיים של כל וידאו רלוונטי.',
    },
    {
      num: '03',
      title: 'סריקת אתר עמוקה',
      desc: 'גילוי כל המוצרים והדפים, חילוץ נתונים, והעשרה עם AI profiles + קישור לתמונות.',
    },
    {
      num: '04',
      title: 'בניית פרסונה',
      desc: 'הרכבת persona ב־GPT־5.4 עם כל ההוראות, הטון, וההגבלות שהוגדרו מראש.',
    },
    {
      num: '05',
      title: 'קונפיגורציית widget',
      desc: 'הגדרת theme, צבעים, מיקום ב־CSP ובאתר, ואינטגרציה עם CRM ו־webhooks אם נדרש.',
    },
    {
      num: '06',
      title: 'בדיקה מקצה לקצה',
      desc: 'שאילתות בעברית ובאנגלית, ולידציית תמונות, אימות קופונים, וריצה על תרחישי קצה.',
    },
  ];

  return (
    <section id="process" className="bg-[#faf9f7] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            התהליך
          </span>
          <h2 className="mt-5 font-grotesk text-3xl md:text-5xl font-bold text-stone-900">
            ככה זה זורם אחרי שאתם שולחים
          </h2>
          <p className="text-stone-500 mt-4">
            6 שלבים. הכל אצלנו. אתם רק יושבים ומחכים שהבוט יעלה.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="relative group">
              <div className="bg-white border border-stone-200 rounded-2xl p-7 h-full hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 transition-all">
                <span className="font-grotesk text-5xl font-bold text-stone-100 group-hover:text-indigo-100 transition-colors">
                  {s.num}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-stone-900">{s.title}</h3>
                <p className="mt-2 text-stone-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-2xl mx-auto bg-gradient-to-br from-indigo-50 via-white to-amber-50/30 border border-indigo-100 rounded-2xl p-8 text-center">
          <p className="text-sm text-stone-500">זמן כולל לחשבון מלא</p>
          <p className="font-grotesk text-4xl md:text-5xl font-bold text-stone-900 mt-2">24–48 שעות</p>
          <p className="text-sm text-stone-500 mt-3">
            מרגע שכל הפרטים מגיעים אלינו ועד שהבוט עולה לאוויר. בלי אקסטרות.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA / Form
// ---------------------------------------------------------------------------

function CTAForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    instagram: '',
    website: '',
    type: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setSubmitting(true);

    try {
      await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'de38eac6-d2fb-46a7-ac09-5ec860147ca0',
          serviceName: 'BestieAI Onboarding Lead',
          fullName: form.name,
          email: form.email,
          phone: form.phone || undefined,
          notes: `Instagram: ${form.instagram || 'N/A'} | Website: ${form.website || 'N/A'} | Type: ${form.type || 'N/A'}`,
        }),
      });
      setSubmitted(true);
    } catch {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-white border border-stone-200 text-stone-900 text-sm placeholder-stone-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-colors';

  return (
    <section id="form" className="bg-gradient-to-b from-white to-[#faf9f7] py-24 md:py-32">
      <div className="max-w-xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-4xl font-bold text-stone-900 text-center">
          מוכנים? בואו נתחיל
        </h2>
        <p className="text-stone-500 text-center mt-4">
          השאירו פרטים ונחזור אליכם עם הצעה ושאלון אונבורדינג מסודר. הקמה מלאה תוך 24–48 שעות
          מרגע שכל הפרטים מגיעים.
        </p>

        {submitted ? (
          <div className="mt-12 text-center bg-white border border-stone-200 rounded-2xl p-12 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-emerald-500">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-6 text-xl font-semibold text-stone-900">קיבלנו</h3>
            <p className="mt-2 text-stone-500 text-sm">
              נחזור אליכם עם שאלון האונבורדינג המלא. הקמת חשבון מלא תוך 24–48 שעות מרגע
              שכל הפרטים אצלנו.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-12 bg-white border border-stone-200 rounded-2xl p-8 space-y-4 shadow-sm">
            <input
              type="text"
              placeholder="שם מלא"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              className={inputCls}
            />
            <input
              type="email"
              placeholder="אימייל"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              className={inputCls}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
            <input
              type="tel"
              placeholder="טלפון (אופציונלי)"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={inputCls}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
            <input
              type="text"
              placeholder="שם משתמש באינסטגרם"
              value={form.instagram}
              onChange={(e) => set('instagram', e.target.value)}
              className={inputCls}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
            <input
              type="url"
              placeholder="כתובת אתר (אופציונלי)"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              className={inputCls}
              style={{ direction: 'ltr', textAlign: 'right' }}
            />
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              className={`${inputCls} appearance-none`}
            >
              <option value="">אני...</option>
              <option value="creator">יוצר/ת תוכן / משפיען/ית</option>
              <option value="brand">מותג / e-commerce</option>
              <option value="agency">סוכנות / נותן שירות</option>
              <option value="other">אחר</option>
            </select>

            <button
              type="submit"
              disabled={submitting || !form.name || !form.email}
              className="w-full py-3.5 rounded-xl bg-stone-900 text-white font-semibold text-sm hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>שולח...</span>
                </>
              ) : (
                'שלחו לי את שאלון האונבורדינג'
              )}
            </button>

            <p className="text-center text-xs text-stone-400">
              בלי כרטיס אשראי. בלי התחייבות. הקמה תוך 24–48 שעות.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="bg-white border-t border-stone-200 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4" dir="rtl">
        <div className="flex items-center gap-3">
          <Image src="/Logo.png" alt="BestieAI" width={120} height={34} className="h-7 w-auto" />
          <span className="text-stone-400 text-sm">by LDRS Group</span>
        </div>
        <p className="text-stone-400 text-xs">&copy; 2026 BestieAI. All rights reserved.</p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingGuideLanding() {
  return (
    <main className="bg-white text-stone-900 antialiased" style={{ fontFamily: "'Inter', 'Heebo', sans-serif" }}>
      <style jsx global>{`
        .font-grotesk {
          font-family: 'Space Grotesk', 'Inter', sans-serif;
        }
        html {
          scroll-behavior: smooth;
        }
      `}</style>
      <Navbar />
      <Hero />
      <Numbers />
      <Required />
      <Recommended />
      <Optional />
      <DontNeed />
      <Consequences />
      <Process />
      <CTAForm />
      <Footer />
    </main>
  );
}
