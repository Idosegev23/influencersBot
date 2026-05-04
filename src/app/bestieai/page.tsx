'use client';

import { useState } from 'react';
import Image from 'next/image';

/* ==========================================================================
   BestieAI Landing Page
   Hebrew-first, warm light palette, no emojis, real capabilities only.
   Palette: warm white bg, soft slate text, indigo-500 accent, peach/amber warm tones.
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
          <a href="#problem" className="hover:text-stone-900 transition-colors">הבעיה</a>
          <a href="#how" className="hover:text-stone-900 transition-colors">איך זה עובד</a>
          <a href="#capabilities" className="hover:text-stone-900 transition-colors">מה זה עושה</a>
          <a href="#cases" className="hover:text-stone-900 transition-colors">סיפורים אמיתיים</a>
        </div>

        <a
          href="#form"
          className="hidden md:inline-flex px-5 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
        >
          קבלו דמו חינם
        </a>

        <button className="md:hidden text-stone-600" onClick={() => setOpen(!open)}>
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-stone-100 px-6 py-4 space-y-3">
          <a href="#problem" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">הבעיה</a>
          <a href="#how" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">איך זה עובד</a>
          <a href="#capabilities" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">מה זה עושה</a>
          <a href="#cases" onClick={() => setOpen(false)} className="block text-stone-600 text-sm">סיפורים אמיתיים</a>
          <a href="#form" onClick={() => setOpen(false)} className="block text-stone-900 font-semibold text-sm">קבלו דמו חינם</a>
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
        {/* Right side — copy (RTL so this shows on the right) */}
        <div className="text-right" dir="rtl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs text-indigo-600 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            21 חשבונות פעילים עכשיו
          </div>

          <h1 className="font-grotesk text-4xl md:text-5xl lg:text-6xl font-bold text-stone-900 leading-[1.1] tracking-tight">
            התוכן שלך<br />
            <span className="text-indigo-500">יודע לדבר חזרה</span>
          </h1>

          <p className="mt-6 text-lg text-stone-500 leading-relaxed max-w-lg">
            BestieAI סורק כל פוסט, רילס וסטורי שפרסמת אי פעם.
            מתמלל את הסרטונים, קורא את האתר שלך, ובונה AI שעונה
            לעוקבים ולמבקרים — בסגנון שלך, עם הידע שלך, מסביב לשעון.
          </p>

          <div className="flex flex-wrap gap-4 mt-10 justify-start">
            <a
              href="#form"
              className="px-7 py-3.5 rounded-full bg-stone-900 text-white font-semibold text-sm hover:bg-stone-800 transition-colors"
            >
              קבלו דמו חינם
            </a>
            <a
              href="#how"
              className="px-7 py-3.5 rounded-full border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
            >
              איך זה עובד
            </a>
          </div>

          <p className="mt-5 text-xs text-stone-400">
            בלי כרטיס אשראי. בלי קוד. הקמה תוך 5 דקות.
          </p>
        </div>

        {/* Left side — DM mockup */}
        <div className="relative hidden md:block">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-100/30 to-transparent rounded-3xl blur-2xl" />
          <div className="relative bg-white rounded-3xl border border-stone-200 p-6 shadow-xl shadow-stone-200/50">
            {/* DM header */}
            <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600" />
              <div>
                <p className="text-stone-900 text-sm font-semibold">your_brand</p>
                <p className="text-stone-400 text-xs">BestieAI active</p>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
            </div>

            {/* Messages */}
            <div className="mt-5 space-y-4 text-sm" dir="rtl">
              <div className="flex justify-start">
                <div className="bg-stone-100 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%] text-stone-700">
                  היי, ראיתי את הרילס על הסרום לפנים — איזה מותג זה?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[80%] text-stone-700">
                  זה הסרום ויטמין C של ארגניה, הצגתי אותו בסטורי ביום שלישי.
                  אני משתמשת בו כבר שלושה חודשים. רוצה לינק?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-stone-100 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%] text-stone-700">
                  כן בבקשה! יש קוד הנחה?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[80%] text-stone-700">
                  הנה הלינק: argania-oil.co.il/vitamin-c
                  <br />
                  קוד הנחה: BESTIE15 ל-15% הנחה
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-stone-400" dir="rtl">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:300ms]" />
              </span>
              תגובה תוך 2.4 שניות
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
    { value: '21', label: 'חשבונות פעילים' },
    { value: '<3s', label: 'זמן תגובה ממוצע' },
    { value: '24/7', label: 'זמינות רציפה' },
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
// The Problem
// ---------------------------------------------------------------------------

function Problem() {
  const stages = [
    { label: 'צפו ברילס שלך', count: '10,000', pct: 100, color: 'bg-indigo-400' },
    { label: 'ביקרו בפרופיל', count: '620', pct: 62, color: 'bg-indigo-300' },
    { label: 'שלחו DM', count: '84', pct: 20, color: 'bg-amber-400' },
    { label: 'קיבלו תשובה', count: '12', pct: 5, color: 'bg-rose-300' },
    { label: 'הפכו ללקוחות', count: '3', pct: 2, color: 'bg-rose-400' },
  ];

  return (
    <section id="problem" className="bg-white py-24 md:py-32">
      <div className="max-w-4xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900 text-center leading-tight">
          מה קורה אחרי שרואים את התוכן שלך?
        </h2>
        <p className="text-stone-500 text-center mt-4 max-w-2xl mx-auto">
          כל פיסת תוכן שאתם מפרסמים יוצרת עניין.
          רוב העניין הזה מת בפער שבין צפייה לשיחה.
        </p>

        <div className="mt-16 space-y-4">
          {stages.map((s) => (
            <div key={s.label} className="flex items-center gap-4">
              <span className="w-28 md:w-36 text-left text-sm text-stone-400 shrink-0">{s.label}</span>
              <div className="flex-1 h-10 bg-stone-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${s.color} rounded-lg flex items-center justify-end pr-3 transition-all duration-700`}
                  style={{ width: `${s.pct}%` }}
                >
                  <span className="text-xs font-semibold text-white">{s.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-14 text-center font-grotesk text-2xl md:text-3xl font-bold text-indigo-500">
          מה קרה ל-9,997 האחרים?
        </p>
        <p className="text-stone-500 text-center mt-4 max-w-xl mx-auto text-sm leading-relaxed">
          הם עזבו. לא כי לא התעניינו — אלא כי אף אחד לא ענה מספיק מהר.
          BestieAI דואג שכל הודעה מקבלת תשובה מיידית ומדויקת.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How It Works
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'סורקים הכל',
      desc: 'פוסטים, רילס, סטוריז, היילייטס, האתר שלך — BestieAI שואב את הכל. תוכן וידאו מתומלל. טקסט מאונדקס. תמונות מנותחות. שום דבר לא הולך לאיבוד.',
      detail: 'רץ אוטומטית כל 24 שעות כדי שה-AI תמיד יכיר את התוכן העדכני שלך.',
    },
    {
      num: '02',
      title: 'בונים מאגר ידע',
      desc: 'כל התוכן שלך עובר עיבוד למאגר ידע מובנה עם חיפוש סמנטי. ה-AI לא ממציא — הוא שולף מידע אמיתי מדברים שאמרת ופרסמת.',
      detail: 'תומך בעברית, אנגלית וערבית. מתמודד עם תוכן רב-לשוני באופן טבעי.',
    },
    {
      num: '03',
      title: 'ה-AI שלך עולה לאוויר',
      desc: 'צ\'אטבוט שמדבר בסגנון שלך מתחיל לענות ב-DM באינסטגרם ולמבקרים באתר. הוא מכיר את המוצרים שלך, את הדעות שלך, את ההמלצות שלך — כי הוא למד אותם ממך.',
      detail: 'כולל לכידת לידים, שיתוף קופונים, טפסי בריף וניתוח שיחות.',
    },
  ];

  return (
    <section id="how" className="bg-[#faf9f7] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900 text-center">
          איך זה באמת עובד
        </h2>
        <p className="text-stone-500 text-center mt-4 max-w-lg mx-auto">
          בלי קסמים. בלי קופסה שחורה. ככה זה עובד מתחת למכסה.
        </p>

        <div className="mt-20 grid md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.num} className="relative group">
              <div className="bg-white border border-stone-200 rounded-2xl p-8 h-full hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 transition-all">
                <span className="font-grotesk text-5xl font-bold text-stone-100 group-hover:text-indigo-100 transition-colors">
                  {s.num}
                </span>
                <h3 className="mt-4 text-xl font-semibold text-stone-900">{s.title}</h3>
                <p className="mt-3 text-stone-500 text-sm leading-relaxed">{s.desc}</p>
                <p className="mt-4 text-xs text-stone-400 border-t border-stone-100 pt-4">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What it actually does (real capabilities)
// ---------------------------------------------------------------------------

function Capabilities() {
  const items = [
    {
      title: 'תשובות מתוכן אמיתי',
      desc: 'מישהו שואל על מוצר שהזכרת ברילס לפני 3 שבועות. ה-AI תמלל את הרילס, אינדקס אותו, ונותן תשובה מדויקת — עם שם המוצר, מה שאמרת עליו, ולינק לרכישה.',
    },
    {
      title: 'לוכד לידים בזמן שאתם ישנים',
      desc: 'לקוח פוטנציאלי נכנס לאתר שלכם בשעה 2 בלילה. הצ\'אט עונה על שאלות, מציג את קטלוג השירותים, ואוסף בריף מלא עם שם, תקציב ומטרות. אתם מתעוררים עם ליד חם.',
    },
    {
      title: 'משתף קופונים ולינקים',
      desc: 'העוקבים שואלים "יש קוד הנחה?" — ה-AI מכיר את הקופונים הפעילים, משתף אותם מיד, ומפנה לקישורי שותפים. כל שיחה היא המרה פוטנציאלית.',
    },
    {
      title: 'מדבר את השפה שלכם',
      desc: 'עברית, אנגלית, ערבית — ה-AI מתמודד עם שיחות רב-לשוניות באופן טבעי. עוקב יכול לשאול בעברית ולקבל תשובה שמתייחסת לרילס באנגלית שפרסמת.',
    },
    {
      title: 'מתעדכן כל יום בעצמו',
      desc: 'כל 24 שעות BestieAI סורק מחדש את הפרופיל. פוסט חדש? ה-AI יודע עליו. סטורי נמחק? הוא כבר לא במאגר. ה-AI שלכם תמיד עדכני כמו התוכן שלכם.',
    },
    {
      title: 'דשבורד ואנליטיקס',
      desc: 'רואים כל שיחה, כל ליד, כל מסמך. עוקבים אחרי מה שאנשים שואלים, אילו מוצרים מעניינים הכי הרבה, וכמה הודעות ה-AI טיפל בזמן שהייתם אופליין.',
    },
  ];

  return (
    <section id="capabilities" className="bg-white py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900 text-center">
          מה BestieAI באמת עושה
        </h2>
        <p className="text-stone-500 text-center mt-4 max-w-lg mx-auto">
          בלי באזוורדס. אלה דברים שהמערכת עושה היום עבור חשבונות אמיתיים.
        </p>

        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Real Use Cases
// ---------------------------------------------------------------------------

function UseCases() {
  const cases = [
    {
      time: '3:47',
      period: 'לפנות בוקר',
      location: 'תל אביב',
      title: 'העוקבת ששאלה בשלוש בלילה',
      story:
        'עוקבת צופה ברילס על טיפוח ושולחת DM ליוצרת תוכן, שואלת איזה בדיוק מוצר הוצג. היוצרת ישנה. BestieAI מזהה את הרילס, שולף את התמלול, מזהה את המוצר, ומגיב עם השם, הערה אישית שהיוצרת אמרה עליו, ולינק לרכישה. עד הבוקר נמכרו 14 יחידות דרך הלינק.',
      tag: 'יוצרת תוכן — 180K עוקבים',
    },
    {
      time: '09:12',
      period: 'בוקר',
      location: 'חיפה',
      title: 'הלקוח שהגיע ביום ראשון שקט',
      story:
        'בעל עסק נכנס לאתר של סוכנות שיווק ביום ראשון בבוקר, מחפש ניהול רשתות חברתיות. ווידג\'ט הצ\'אט עונה על שאלות לגבי שירותים ותמחור, ואז מציע טופס מיני-בריף. הלקוח ממלא — שם, עסק, מטרות, תקציב. ביום שני בבוקר, הסוכנות מוצאת בריף מלא בגוגל דרייב והתראה בדשבורד.',
      tag: 'סוכנות — נותן שירות',
    },
    {
      time: '23:58',
      period: 'בלילה',
      location: 'ארצי',
      title: 'Black Friday, אלפיים הודעות בלילה אחד',
      story:
        'מותג קוסמטיקה מריץ קמפיין מבצע. הפוסט הופך ויראלי. ה-DMs מציפים — "מה ההנחה?", "זה זמין בגוון שלי?", "מתי המבצע נגמר?". BestieAI מטפל בכל הודעה עם מידע מדויק על מוצרים, קופונים פעילים ולינקים לאתר. אף הודעה לא נשארה ללא מענה.',
      tag: 'מותג — e-commerce',
    },
  ];

  return (
    <section id="cases" className="bg-[#faf9f7] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900 text-center">
          סיפורים אמיתיים, תוצאות אמיתיות
        </h2>
        <p className="text-stone-500 text-center mt-4">
          אלה לא תרחישים תיאורטיים. ככה זה נראה בחשבונות פעילים.
        </p>

        <div className="mt-16 grid md:grid-cols-3 gap-8">
          {cases.map((c) => (
            <div
              key={c.title}
              className="bg-white border border-stone-200 rounded-2xl p-8 flex flex-col hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all"
            >
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <span className="font-mono text-stone-600 font-semibold">{c.time}</span>
                <span>{c.period}</span>
                <span className="w-1 h-1 rounded-full bg-stone-300" />
                <span>{c.location}</span>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-stone-900">{c.title}</h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed flex-1">{c.story}</p>

              <div className="mt-6 pt-4 border-t border-stone-100">
                <span className="text-xs text-stone-400">{c.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why not just use ChatGPT
// ---------------------------------------------------------------------------

function WhyUs() {
  const rows = [
    { feature: 'מכיר את התוכן הספציפי שלך', us: true, them: false },
    { feature: 'עונה מתוך הרילס והסטוריז שלך', us: true, them: false },
    { feature: 'מתעדכן אוטומטית כל יום', us: true, them: false },
    { feature: 'מחובר ל-DM של אינסטגרם', us: true, them: false },
    { feature: 'מוטמע באתר שלך', us: true, them: false },
    { feature: 'לוכד לידים ובריפים', us: true, them: false },
    { feature: 'מדבר עברית באופן טבעי', us: true, them: false },
    { feature: 'דשבורד עם אנליטיקס של שיחות', us: true, them: false },
  ];

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="max-w-3xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-5xl font-bold text-stone-900 text-center">
          למה לא פשוט להשתמש ב-ChatGPT?
        </h2>
        <p className="text-stone-500 text-center mt-4">
          ChatGPT הוא AI כללי. BestieAI הוא AI ספציפי — הוא יודע רק מה שאתם יודעים,
          ואומר רק מה שאתם הייתם אומרים.
        </p>

        <div className="mt-12 bg-[#faf9f7] border border-stone-200 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_80px] px-6 py-4 border-b border-stone-200 text-xs text-stone-400 font-medium">
            <span />
            <span className="text-center text-indigo-500 font-semibold">BestieAI</span>
            <span className="text-center">ChatGPT</span>
          </div>

          {rows.map((r, i) => (
            <div
              key={r.feature}
              className={`grid grid-cols-[1fr_80px_80px] px-6 py-3.5 text-sm ${
                i < rows.length - 1 ? 'border-b border-stone-100' : ''
              }`}
            >
              <span className="text-stone-600">{r.feature}</span>
              <span className="text-center text-emerald-500 font-medium">V</span>
              <span className="text-center text-stone-300">X</span>
            </div>
          ))}
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
          serviceName: 'BestieAI Landing Page Lead',
          fullName: form.name,
          email: form.email,
          phone: form.phone || undefined,
          notes: `Instagram: ${form.instagram || 'N/A'} | Type: ${form.type || 'N/A'}`,
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
    <section id="form" className="bg-gradient-to-b from-[#faf9f7] to-white py-24 md:py-32">
      <div className="max-w-xl mx-auto px-6" dir="rtl">
        <h2 className="font-grotesk text-3xl md:text-4xl font-bold text-stone-900 text-center">
          תראו את זה עובד עם התוכן שלכם
        </h2>
        <p className="text-stone-500 text-center mt-4">
          השאירו פרטים ונבנה לכם דמו מהאינסטגרם שלכם — בחינם, בלי התחייבות.
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
              נסרוק את הפרופיל שלכם ונחזור אליכם תוך 24 שעות עם דמו עובד.
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
              placeholder="שם משתמש באינסטגרם (אופציונלי)"
              value={form.instagram}
              onChange={(e) => set('instagram', e.target.value)}
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
                'בנו לי דמו'
              )}
            </button>

            <p className="text-center text-xs text-stone-400">
              חינם. בלי כרטיס אשראי. בלי התחייבות.
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

export default function BestieAILanding() {
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
      <Problem />
      <HowItWorks />
      <Capabilities />
      <UseCases />
      <WhyUs />
      <CTAForm />
      <Footer />
    </main>
  );
}
