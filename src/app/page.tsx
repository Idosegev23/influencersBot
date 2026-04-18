'use client';

/* ==========================================================================
   BestieAI — Public Landing Page (root "/")
   Hebrew-first, RTL, warm palette. Real capabilities only — no invented
   numbers, testimonials, or pricing. Lead form posts to /api/briefs.
   ========================================================================== */

import { useState, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Sparkles,
  MessageSquare,
  Code2,
  FileText,
  LayoutDashboard,
  Instagram,
  MessageCircle,
  Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Shared motion helpers                                              */
/* ------------------------------------------------------------------ */

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: EASE },
  viewport: { once: true, margin: '-80px' },
};

const stagger = {
  whileInView: { transition: { staggerChildren: 0.08 } },
  viewport: { once: true, margin: '-80px' },
};

/* ------------------------------------------------------------------ */
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */

function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#capabilities', label: 'מה זה עושה' },
    { href: '#how', label: 'איך זה עובד' },
    { href: '#faq', label: 'שאלות' },
  ];

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/75 backdrop-blur-xl border-b border-stone-200/60">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16" dir="rtl">
        <Link href="#hero" className="flex items-center shrink-0">
          <Image src="/Logo.png" alt="BestieAI" width={140} height={40} priority className="h-8 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-stone-500">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-stone-900 transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/admin"
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            כניסה למערכת
          </Link>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
          >
            מעוניינים לשמוע עוד
            <ArrowLeft className="w-3.5 h-3.5" />
          </a>
        </div>

        <button
          aria-label="תפריט"
          className="md:hidden text-stone-700 p-1"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="md:hidden overflow-hidden bg-white border-t border-stone-100"
          >
            <div className="px-6 py-5 space-y-4" dir="rtl">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block text-sm text-stone-600"
                >
                  {l.label}
                </a>
              ))}
              <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                <Link href="/admin" className="text-sm text-stone-600" onClick={() => setOpen(false)}>
                  כניסה למערכת
                </Link>
                <a
                  href="#contact"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-stone-900 text-white text-xs font-semibold"
                >
                  שלחו פנייה
                  <ArrowLeft className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-[100svh] flex items-center pt-28 md:pt-24 pb-20 overflow-hidden
                 bg-gradient-to-b from-[#faf9f7] via-white to-white"
    >
      {/* soft warm blobs */}
      <div className="pointer-events-none absolute -top-24 right-[20%] w-[560px] h-[560px] bg-indigo-100/50 rounded-full blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 left-[15%] w-[420px] h-[420px] bg-amber-100/40 rounded-full blur-[110px]" />

      {/* subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(168 162 158 / 0.35) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
        }}
      />

      <div className="relative max-w-6xl w-full mx-auto px-6 grid md:grid-cols-2 gap-14 md:gap-16 items-center">
        {/* Copy — RTL aligns to right naturally */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="text-right order-2 md:order-1"
          dir="rtl"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-stone-200 text-xs text-stone-600 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            הצ׳אטבוט הראשון ליוצרי תוכן בעברית
          </span>

          <h1 className="mt-7 text-[2.75rem] leading-[1.05] md:text-6xl lg:text-[4.25rem] font-black text-stone-900 tracking-tight">
            התוכן שלך
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                יודע לדבר חזרה
              </span>
              <span className="absolute bottom-1.5 right-0 left-0 h-3 bg-amber-200/60 -z-0 rounded-sm" aria-hidden />
            </span>
            .
          </h1>

          <p className="mt-7 text-lg md:text-[1.15rem] text-stone-600 leading-relaxed max-w-xl">
            BestieAI סורק כל פוסט, רילס וסטורי שפרסמתם. מתמלל סרטונים, קורא את האתר,
            ובונה AI שעונה לעוקבים ולמבקרים — בסגנון שלכם, בעברית, מסביב לשעון.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#contact"
              className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-stone-900 text-white font-semibold text-sm
                         hover:bg-stone-800 transition-all shadow-lg shadow-stone-900/10 hover:shadow-stone-900/20"
            >
              מעוניינים לשמוע עוד
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            </a>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-stone-300 text-stone-700 text-sm font-medium
                         hover:border-stone-400 hover:bg-white transition-all"
            >
              כניסה למערכת
            </Link>
          </div>

          <p className="mt-5 text-xs text-stone-400">
            בלי כרטיס אשראי · בלי קוד · בלי התחייבות
          </p>
        </motion.div>

        {/* DM mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
          className="relative order-1 md:order-2"
        >
          <div className="absolute -inset-6 bg-gradient-to-br from-indigo-100/60 via-transparent to-amber-100/50 rounded-[2rem] blur-2xl" />
          <div className="relative bg-white rounded-3xl border border-stone-200/80 p-6 shadow-2xl shadow-stone-900/10">
            {/* DM header */}
            <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
                B
              </div>
              <div dir="rtl">
                <p className="text-stone-900 text-sm font-semibold">your_brand</p>
                <p className="text-stone-400 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  BestieAI פעיל
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm" dir="rtl">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
                className="flex justify-start"
              >
                <div className="bg-stone-100 text-stone-800 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%]">
                  היי, ראיתי את הרילס על הסרום לפנים — איזה מותג זה?
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 }}
                className="flex justify-end"
              >
                <div className="bg-indigo-50 border border-indigo-100 text-stone-800 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[80%]">
                  זה הסרום ויטמין C של ארגניה, הצגתי אותו בסטורי ביום שלישי.
                  אני משתמשת בו כבר שלושה חודשים. רוצה לינק?
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.4 }}
                className="flex justify-start"
              >
                <div className="bg-stone-100 text-stone-800 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%]">
                  כן בבקשה! יש קוד הנחה?
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.8 }}
                className="flex justify-end"
              >
                <div className="bg-indigo-50 border border-indigo-100 text-stone-800 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[80%]">
                  הנה הלינק: <span className="underline decoration-indigo-300">argania.co.il/vitamin-c</span>
                  <br />
                  קוד הנחה: <strong>BESTIE15</strong> ל-15% הנחה
                </div>
              </motion.div>
            </div>

            <div className="mt-5 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs text-stone-400" dir="rtl">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:300ms]" />
              </span>
              מקליד תשובה…
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Problem — "Moment of recognition"                                  */
/* ------------------------------------------------------------------ */

function Problem() {
  return (
    <section className="relative bg-stone-950 text-stone-100 py-28 md:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.15) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <motion.div
        {...fadeUp}
        className="relative max-w-3xl mx-auto px-6 text-center"
        dir="rtl"
      >
        <p className="text-xs tracking-[0.25em] uppercase text-indigo-300/80 font-medium mb-10">
          רגע של כנות
        </p>

        <h2 className="text-3xl md:text-5xl lg:text-6xl font-black leading-[1.15] tracking-tight">
          <span className="block text-white">חמישים אלף עוקבים.</span>
          <span className="block text-white">שלוש־מאות הודעות ביום.</span>
          <span className="block mt-3 text-stone-400">
            כל אחת מהן הייתה יכולה להיות שת״פ, רכישה, לקוחה לחיים.
          </span>
          <span className="block mt-3 text-stone-400">
            ביממה יש 24 שעות — ואתם לא מכונה.
          </span>
          <span className="block mt-8 text-3xl md:text-4xl bg-gradient-to-r from-indigo-300 to-amber-200 bg-clip-text text-transparent">
            עכשיו יש לכם אחת.
          </span>
        </h2>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Capabilities — 6 real features                                     */
/* ------------------------------------------------------------------ */

type Cap = {
  icon: ReactNode;
  title: string;
  body: string;
  badge?: string;
  accent: string; // tailwind bg class for icon
};

function Capabilities() {
  const items: Cap[] = [
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: 'צ׳אטבוט שמדבר בקול שלכם',
      body:
        '11 ארכיטיפים (טיפוח, אופנה, בישול, כושר, הורות, קופונים, טק, טיולים, מיינדסט, עיצוב, כללי). לא עוזר AI גנרי — זה אתם על אוטומט, עם הסגנון, ההומור והקווים האדומים שלכם.',
      accent: 'bg-indigo-500',
    },
    {
      icon: <Code2 className="w-5 h-5" />,
      title: 'וידג׳ט לאתר שלכם',
      body:
        'שורת JavaScript אחת והוא חי. עונה על מוצרים, קופונים ותוכן מהאתר, בצבעים שלכם, בזמן אמת, עם סטרימינג. תמיכה מלאה ב-RTL.',
      accent: 'bg-amber-500',
    },
    {
      icon: <FileText className="w-5 h-5" />,
      title: 'ניתוח חוזים ובריפים אוטומטי',
      body:
        'תעלו PDF, תמונה או Word. ה-AI מחלץ סכום, תאריכים, תנאים ודדליינים — עם ציון ביטחון. שרשרת גיבוי חכמה (Gemini → Claude → GPT-4o). עברית, אנגלית, ערבית, רוסית.',
      accent: 'bg-emerald-500',
    },
    {
      icon: <LayoutDashboard className="w-5 h-5" />,
      title: 'דשבורד אחד לכל החיים',
      body:
        'אנליטיקס על העוקבים והביצועים, ניהול שת״פים, מעקב הכנסות ודדליינים, ניהול קופונים, ארכיון מסמכים, היסטוריית שיחות, הגדרות פרסונה — הכול במקום אחד.',
      accent: 'bg-violet-500',
    },
    {
      icon: <Instagram className="w-5 h-5" />,
      title: 'סריקת אינסטגרם ובניית פרסונה',
      body:
        'חיבור אחד. פוסטים, רילסים, סטוריז, היילייטס ותגובות נסרקים ונבנים ל-RAG חי. הפרסונה שלכם — הסגנון, הטון, הקווים האדומים — נבנית אוטומטית מהתוכן עצמו.',
      accent: 'bg-rose-500',
    },
    {
      icon: <MessageCircle className="w-5 h-5" />,
      title: 'התראות WhatsApp',
      body:
        'דייג׳סט שבועי, הודעות ברוכים הבאים, תמיכה — על גבי WhatsApp Cloud API הרשמי. חלק מהתבניות ממתינות לאישור Meta.',
      accent: 'bg-teal-500',
      badge: 'בקרוב',
    },
  ];

  return (
    <section id="capabilities" className="relative bg-white py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6" dir="rtl">
        <motion.div {...fadeUp} className="max-w-2xl">
          <p className="text-xs tracking-[0.25em] uppercase text-indigo-500 font-semibold mb-4">
            מה זה עושה
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-stone-900 tracking-tight leading-[1.1]">
            שש יכולות.
            <br />
            כולן קיימות. כולן עובדות.
          </h2>
          <p className="mt-5 text-lg text-stone-500 leading-relaxed">
            בלי באזוורדס, בלי &ldquo;בקרוב יהיה&rdquo;, בלי הבטחות שיווקיות. רק
            מה שהמערכת עושה היום עבור חשבונות אמיתיים.
          </p>
        </motion.div>

        <motion.div
          {...stagger}
          initial="initial"
          className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {items.map((item) => (
            <motion.div
              key={item.title}
              variants={{
                initial: { opacity: 0, y: 24 },
                whileInView: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.6, ease: EASE }}
              className="group relative bg-[#faf9f7] border border-stone-200/80 rounded-2xl p-7
                         hover:border-stone-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-stone-200/60
                         transition-all duration-300"
            >
              {item.badge && (
                <span className="absolute top-5 left-5 px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                  {item.badge}
                </span>
              )}

              <div
                className={`w-11 h-11 rounded-xl ${item.accent} text-white flex items-center justify-center
                            shadow-md shadow-stone-300/40 group-hover:scale-105 transition-transform`}
              >
                {item.icon}
              </div>

              <h3 className="mt-5 text-lg font-bold text-stone-900 tracking-tight">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">{item.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How It Works — 3 steps                                             */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'מחברים חשבון',
      body: 'כניסה אחת לאינסטגרם. זהו. בלי קוד, בלי הגדרות, בלי טכנאי.',
    },
    {
      num: '02',
      title: 'ה-AI לומד אתכם',
      body: 'כל פוסט, רילס, סטורי והיילייט — נסרק ומתומלל. הפרסונה שלכם נבנית מהתוכן שלכם עצמו: הסגנון, המוצרים, הקופונים, והדברים שאתם לא מוכנים לעשות.',
    },
    {
      num: '03',
      title: 'הבוט עולה לאוויר',
      body: 'עונה ב-DM, באתר, ובקרוב גם ב-WhatsApp. בעברית, בקול שלכם, מסביב לשעון. אתם חוזרים להיות יוצרים — לא מוקדנים.',
    },
  ];

  return (
    <section id="how" className="relative bg-[#faf9f7] py-28 md:py-36 overflow-hidden">
      <div className="pointer-events-none absolute top-1/2 right-0 w-[500px] h-[500px] bg-indigo-100/40 rounded-full blur-[120px] -translate-y-1/2" />

      <div className="relative max-w-6xl mx-auto px-6" dir="rtl">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
          <p className="text-xs tracking-[0.25em] uppercase text-indigo-500 font-semibold mb-4">
            איך זה עובד
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-stone-900 tracking-tight leading-[1.1]">
            שלושה שלבים.
            <br />
            בין 30 דקות לכמה שעות.
          </h2>
        </motion.div>

        <div className="mt-20 grid md:grid-cols-3 gap-5 relative">
          {/* connecting line (desktop) */}
          <div className="hidden md:block absolute top-10 right-[16.666%] left-[16.666%] h-px bg-gradient-to-l from-stone-200 via-indigo-200 to-stone-200" />

          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.12 }}
              viewport={{ once: true, margin: '-80px' }}
              className="relative bg-white border border-stone-200 rounded-2xl p-8 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 transition-all"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-sm shadow-lg shadow-indigo-200">
                {s.num}
              </div>
              <h3 className="mt-6 text-xl font-bold text-stone-900 tracking-tight">{s.title}</h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

function Faq() {
  const qs = [
    {
      q: 'באיזה שפות זה עובד?',
      a: 'עברית (ראשית), אנגלית, ערבית ורוסית. שפת התשובה נקבעת לפי שפת הפנייה של העוקב — אם כתבו לכם באנגלית, הבוט יענה באנגלית.',
    },
    {
      q: 'מה קורה כשהבוט לא בטוח בתשובה?',
      a: 'הוא לא ממציא. מסמן את השיחה, שולח לכם התראה, אתם עונים — והוא לומד מזה לפעם הבאה. הוא לא יחזור עם אותה שאלה פעמיים.',
    },
    {
      q: 'מה עם פרטיות של שיחות ונתונים?',
      a: 'כל חשבון בסביבה מבודדת לחלוטין (multi-tenant עם Row-Level Security ברמת ה-DB). שיחות מוצפנות בתעבורה, הגישה רק שלכם ושל אנשים שאתם מאשרים במפורש.',
    },
    {
      q: 'כמה זמן לוקח להקים?',
      a: 'מרגע החיבור לאינסטגרם עד בוט פעיל: בין 30 דקות לכמה שעות, תלוי בכמות התוכן בחשבון. הסריקה רצה ברקע — אתם לא צריכים להיות מולה.',
    },
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-28 md:py-36">
      <div className="max-w-3xl mx-auto px-6" dir="rtl">
        <motion.div {...fadeUp} className="mb-14">
          <p className="text-xs tracking-[0.25em] uppercase text-indigo-500 font-semibold mb-4">
            שאלות
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-stone-900 tracking-tight leading-[1.1]">
            מה כולם שואלים.
          </h2>
        </motion.div>

        <div className="divide-y divide-stone-200 border-y border-stone-200">
          {qs.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={item.q} className="py-2">
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-right group"
                >
                  <span className="text-base md:text-lg font-semibold text-stone-900 group-hover:text-indigo-600 transition-colors">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-stone-400 shrink-0 transition-transform duration-300 ${
                      isOpen ? 'rotate-180 text-indigo-500' : ''
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pr-0 text-stone-600 leading-relaxed text-sm md:text-base">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA Form — posts to /api/briefs                                    */
/* ------------------------------------------------------------------ */

function CtaForm() {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  type BizType = 'יוצר/ת תוכן' | 'מותג' | 'סוכנות' | 'אחר';

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    bizType: '' as BizType | '',
    notes: '',
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setError('שם מלא חובה');
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError('צריך אימייל או טלפון כדי שנוכל לחזור');
      return;
    }
    setError('');
    setState('submitting');

    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'landing',
          serviceName: 'פנייה מדף הנחיתה',
          fullName: form.fullName.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          businessName: form.bizType || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'שגיאה בשליחה');
      }
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    }
  }

  const inputCls =
    'w-full px-4 py-3.5 rounded-xl bg-white border border-stone-200 text-stone-900 placeholder:text-stone-400 ' +
    'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all text-sm';

  return (
    <section id="contact" className="relative bg-[#faf9f7] py-28 md:py-36 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-10 left-1/4 w-[400px] h-[400px] bg-indigo-200/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 w-[360px] h-[360px] bg-amber-200/30 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6" dir="rtl">
        <AnimatePresence mode="wait">
          {state === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-stone-200 rounded-3xl p-10 md:p-14 text-center shadow-xl shadow-stone-200/50"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="mt-6 text-2xl md:text-3xl font-black text-stone-900 tracking-tight">
                קיבלנו. מדברים בקרוב.
              </h3>
              <p className="mt-4 text-stone-500 leading-relaxed">
                נחזור אליכם תוך 24 שעות — לרוב הרבה יותר מהר.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="text-center mb-10">
                <p className="text-xs tracking-[0.25em] uppercase text-indigo-500 font-semibold mb-4">
                  בואו נדבר
                </p>
                <h2 className="text-3xl md:text-5xl font-black text-stone-900 tracking-tight leading-[1.1]">
                  מעוניינים לשמוע עוד?
                </h2>
                <p className="mt-5 text-stone-500 leading-relaxed max-w-lg mx-auto">
                  השאירו פרטים — נחזור תוך 24 שעות עם דמו מותאם לתוכן שלכם.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="bg-white border border-stone-200 rounded-3xl p-6 md:p-10 shadow-xl shadow-stone-200/40"
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-2">שם מלא</label>
                    <input
                      type="text"
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className={inputCls}
                      placeholder="ישראלה ישראלי"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-2">
                      סוג העסק
                    </label>
                    <div className="relative">
                      <select
                        value={form.bizType}
                        onChange={(e) => setForm({ ...form, bizType: e.target.value as BizType })}
                        className={`${inputCls} appearance-none pl-10 cursor-pointer`}
                      >
                        <option value="">בחרו סוג</option>
                        <option value="יוצר/ת תוכן">יוצר/ת תוכן</option>
                        <option value="מותג">מותג</option>
                        <option value="סוכנות">סוכנות</option>
                        <option value="אחר">אחר</option>
                      </select>
                      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-2">אימייל</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputCls}
                      placeholder="you@example.com"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-2">טלפון</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className={inputCls}
                      placeholder="054-0000000"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-stone-700 mb-2">
                    ספרו לנו קצת <span className="text-stone-400 font-normal">(אופציונלי)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={`${inputCls} resize-none`}
                    placeholder="כמה עוקבים? איזה תחום? מה הכי מפריע לכם היום?"
                  />
                </div>

                {error && (
                  <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-4 py-2.5">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={state === 'submitting'}
                  className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl
                             bg-stone-900 text-white font-semibold text-sm hover:bg-stone-800
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors shadow-lg shadow-stone-900/20"
                >
                  {state === 'submitting' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      שולח…
                    </>
                  ) : (
                    <>
                      שלחו — ונחזור תוך 24 שעות
                      <ArrowLeft className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-xs text-stone-400">
                  לא שולחים ספאם. לא מוכרים פרטים. לא מצרפים לניוזלטר שלא ביקשתם.
                </p>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="bg-white border-t border-stone-200">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-5" dir="rtl">
        <div className="flex items-center gap-3">
          <Image src="/Logo.png" alt="BestieAI" width={120} height={32} className="h-7 w-auto opacity-80" />
        </div>

        <div className="flex items-center gap-6 text-sm text-stone-500">
          <Link href="/admin" className="hover:text-stone-900 transition-colors">
            כניסה למערכת
          </Link>
          <a href="#contact" className="hover:text-stone-900 transition-colors">
            צרו קשר
          </a>
        </div>

        <p className="text-xs text-stone-400">
          © {new Date().getFullYear()} BestieAI · נבנה ב-
          <a
            href="https://ldrsgroup.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-600 hover:text-stone-900 transition-colors"
          >
            LDRS
          </a>
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Root page                                                          */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-stone-900 antialiased selection:bg-indigo-200/60 selection:text-stone-900">
      <Navbar />
      <Hero />
      <Problem />
      <Capabilities />
      <HowItWorks />
      <Faq />
      <CtaForm />
      <Footer />
    </main>
  );
}
