'use client';

/* ==========================================================================
   BestieAI — Onboarding Requirements Page
   Mirrors the BestieAI brand from src/app/page.tsx:
   warm white #faf7f2, stone palette, brand purple #883fe2 + lavender #b497ef.
   Hebrew RTL.
   ========================================================================== */

import { useState, useRef, useEffect, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
} from 'framer-motion';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;
const INDIGO = '#883fe2';
const PEACH = '#b497ef';

/* ------------------------------------------------------------------ */
/*  Grain overlay                                                       */
/* ------------------------------------------------------------------ */

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] opacity-[0.04] mix-blend-multiply"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Mini brand mark                                                     */
/* ------------------------------------------------------------------ */

function MiniMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/bestie-icon.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}

function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 text-[11px] tracking-[0.25em] uppercase font-semibold ${className}`}
    >
      <MiniMark size={16} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Navbar                                                              */
/* ------------------------------------------------------------------ */

function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const navBg = useTransform(scrollY, [0, 80], ['rgba(250, 247, 242, 0)', 'rgba(250, 247, 242, 0.85)']);
  const navBorder = useTransform(scrollY, [0, 80], ['rgba(28, 25, 23, 0)', 'rgba(28, 25, 23, 0.08)']);

  const links = [
    { href: '#required', label: 'חובה' },
    { href: '#recommended', label: 'מומלץ' },
    { href: '#optional', label: 'אופציונלי' },
    { href: '#process', label: 'תהליך' },
  ];

  return (
    <motion.nav
      style={{ backgroundColor: navBg, borderColor: navBorder }}
      className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl border-b"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-8 h-16" dir="rtl">
        <Link href="/" className="flex items-center shrink-0">
          <Image src="/brand/bestie-wordmark.svg" alt="BestieAI" width={180} height={45} priority className="h-7 md:h-8 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-9 text-sm text-stone-600">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-stone-900 transition-colors relative group">
              {l.label}
              <span className="absolute -bottom-1 right-0 left-0 h-px bg-stone-900 scale-x-0 group-hover:scale-x-100 transition-transform origin-right" />
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link href="/" className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors">
            חזרה לאתר
          </Link>
          <a
            href="#form"
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-stone-900 text-stone-50 text-sm font-semibold hover:bg-stone-800 transition-all"
          >
            התחילו אונבורדינג
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          </a>
        </div>

        <button aria-label="תפריט" className="md:hidden text-stone-800 p-1" onClick={() => setOpen((v) => !v)}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l10 10M6 16L16 6" /> : <path d="M4 7h14M4 11h14M4 15h14" />}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="md:hidden overflow-hidden bg-[#faf7f2] border-t border-stone-200"
          >
            <div className="px-5 py-5 space-y-4" dir="rtl">
              {links.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-base text-stone-700">
                  {l.label}
                </a>
              ))}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
                <Link href="/" className="text-sm text-stone-600" onClick={() => setOpen(false)}>
                  חזרה לאתר
                </Link>
                <a
                  href="#form"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-stone-900 text-stone-50 text-xs font-semibold"
                >
                  התחילו
                  <ArrowLeft className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                                */
/* ------------------------------------------------------------------ */

function MouseParallaxMark() {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 60, damping: 20 });
  const y = useSpring(0, { stiffness: 60, damping: 20 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      x.set((e.clientX - cx) * 0.025);
      y.set((e.clientY - cy) * 0.025);
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      animate={{ rotate: [-2, 2, -2] }}
      transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      className="relative"
    >
      <Image
        src="/brand/bestie-icon.svg"
        alt=""
        width={820}
        height={820}
        priority
        className="w-[220px] sm:w-[280px] md:w-[360px] lg:w-[440px] h-auto drop-shadow-[0_30px_60px_rgba(136,63,226,0.25)]"
      />
    </motion.div>
  );
}

function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-[90svh] pt-28 md:pt-32 pb-16 overflow-hidden bg-[#faf7f2] text-stone-900"
    >
      <div className="pointer-events-none absolute top-10 right-[-20%] w-[700px] h-[700px] rounded-full bg-[#b497ef]/40 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 left-[-15%] w-[600px] h-[600px] rounded-full bg-[#883fe2]/25 blur-[140px]" />

      <div className="relative max-w-7xl w-full mx-auto px-5 md:px-8">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-6 items-center pt-6 md:pt-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE }}
            className="lg:col-span-7 order-2 lg:order-1"
            dir="rtl"
          >
            <Eyebrow className="text-stone-500">צ'ק־ליסט אונבורדינג</Eyebrow>

            <h1
              className="mt-6 font-black tracking-[-0.04em] leading-[0.92] text-stone-900"
              style={{ fontSize: 'clamp(2.25rem, 7.5vw, 6rem)' }}
            >
              רגע לפני שהבוט
              <br />
              <span className="relative inline-block">
                <span className="relative z-10">עולה לאוויר</span>
                <svg
                  className="absolute -bottom-1 right-0 w-full h-[0.5em] z-0"
                  viewBox="0 0 400 40"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <motion.path
                    d="M 8 30 Q 110 10, 210 22 T 392 18"
                    fill="none"
                    stroke={PEACH}
                    strokeWidth="11"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.4, delay: 0.7, ease: EASE }}
                  />
                </svg>
              </span>
              <br />
              <span className="text-stone-400">מה אנחנו צריכים.</span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
              className="mt-8 text-lg md:text-xl text-stone-600 leading-[1.55] max-w-xl"
            >
              בלי סיסמאות, בלי גישות אדמין. רק כמה פרטים פשוטים שיגרמו לבוט להכיר אתכם,
              לדבר בשפה שלכם ולעבוד טוב מהיום הראשון.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
              className="mt-10 flex flex-wrap gap-3"
            >
              <a
                href="#form"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
              >
                התחילו אונבורדינג
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              </a>
              <a
                href="#required"
                className="px-7 py-3.5 rounded-full border border-stone-300 text-stone-700 text-sm font-medium hover:bg-white/60 transition-colors"
              >
                מה צריך לדעת
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: EASE }}
            className="lg:col-span-5 order-1 lg:order-2 flex items-center justify-center"
          >
            <MouseParallaxMark />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Numbers strip                                                       */
/* ------------------------------------------------------------------ */

function Numbers() {
  const stats = [
    { value: '0', label: 'גישות אדמין דרושות' },
    { value: '24–48h', label: 'עד שהבוט באוויר' },
    { value: '3', label: 'שפות נתמכות' },
    { value: '24/7', label: 'הבוט פעיל אחרי השקה' },
  ];

  return (
    <section className="border-y border-stone-200/60 bg-white">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8" dir="rtl">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-black tracking-[-0.03em] text-3xl md:text-4xl text-stone-900">{s.value}</p>
            <p className="text-xs md:text-sm text-stone-500 mt-2">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Required                                                            */
/* ------------------------------------------------------------------ */

function Required() {
  const blocks = [
    {
      tag: '01',
      title: 'פרטי אינסטגרם',
      subtitle: 'בלי זה אי אפשר להתחיל לסרוק',
      items: [
        { label: 'שם משתמש (handle)', detail: 'לדוגמה kuni_il — בלי הכוכבית, רק ה-username.' },
        { label: 'חשבון ציבורי', detail: 'חשבון Private — לא ניתן לסריקה, אינסטגרם חוסמת גישה.' },
        { label: 'Business / Creator', detail: 'מומלץ. Personal גם נתמך אבל מקבל פחות נתונים.' },
      ],
    },
    {
      tag: '02',
      title: 'הסכמה לסריקה',
      subtitle: 'אישור פורמלי לפני שמתחילים',
      items: [
        { label: 'אישור בעל החשבון', detail: 'אישור לסריקת תוכן ציבורי בלבד — פוסטים, ביו, highlights.' },
        { label: 'זכויות תוכן', detail: 'אישור שהתוכן באחריותכם — לא מפר זכויות יוצרים של צד שלישי.' },
      ],
    },
  ];

  return (
    <section id="required" className="bg-[#faf7f2] py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow className="text-rose-600">חובה</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            המינימום שצריך כדי להתחיל
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            שני בלוקים. בלעדיהם הסריקה לא יוצאת לדרך.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-5">
          {blocks.map((b) => (
            <div
              key={b.tag}
              className="bg-white border border-stone-200 rounded-3xl p-8 hover:border-[#b497ef] hover:shadow-xl hover:shadow-[#883fe2]/5 transition-all"
            >
              <div className="flex items-start justify-between">
                <span className="font-black text-5xl text-stone-100 tracking-[-0.05em]">{b.tag}</span>
                <span className="text-[10px] tracking-[0.25em] uppercase text-rose-600 font-bold mt-3">חובה</span>
              </div>
              <h3 className="mt-3 text-xl md:text-2xl font-bold text-stone-900 tracking-tight">{b.title}</h3>
              <p className="text-sm text-stone-500 mt-1">{b.subtitle}</p>

              <ul className="mt-7 space-y-4">
                {b.items.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: INDIGO }} />
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

/* ------------------------------------------------------------------ */
/*  Recommended                                                         */
/* ------------------------------------------------------------------ */

function AutoExtracted() {
  const items = [
    { k: 'פרופיל אינסטגרם', v: 'ביו, סוג חשבון, תמונת פרופיל ⇽ לוגו ראשוני' },
    { k: 'אתר מהביו', v: 'אם יש קישור באתר בביו — סריקה אוטומטית של כל העמודים' },
    { k: 'פוסטים ותגובות', v: 'הפוסטים האחרונים והתגובות עליהם' },
    { k: 'תמלולי וידאו', v: 'כל Reel וכל סטורי בהיילייטים — תמלול מלא' },
    { k: 'מוצרים מהאתר', v: 'שם, מחיר, תיאור ותמונות — מתוך החנות' },
    { k: 'קופונים', v: 'קודי הנחה ואחוזים שמופיעים בפוסטים ובתמלולים' },
    { k: 'שותפויות', v: 'מותגים שאתם משתפים פעולה איתם — מאזכורים' },
    { k: 'טון ופרסונה', v: 'הזהות, הסגנון והגבולות שלכם — מנותחים מהתוכן' },
    { k: 'נושאים מרכזיים', v: 'הנושאים שחוזרים על עצמם — מסווגים אוטומטית' },
    { k: 'שאלות נפוצות', v: 'מתוך תגובות חוזרות של עוקבים' },
    { k: 'מידע על כל מוצר', v: 'למי מתאים, מה הוא עושה, עם מה משלימים' },
    { k: 'התאמת הצ׳אט', v: 'בחירת טאבים ושאלות מוצעות לפי סוג העסק' },
  ];

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="max-w-5xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow className="text-stone-500">אוטומטי</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            את רוב העבודה
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">אנחנו עושים לבד</span>
              <svg
                className="absolute -bottom-1 right-0 w-full h-[0.5em] z-0"
                viewBox="0 0 400 40"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path d="M 8 30 Q 110 10, 210 22 T 392 18" fill="none" stroke={PEACH} strokeWidth="11" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            הסריקה שלנו מנתחת את החשבון והאתר ומחלצת את כל מה שצריך לבוט. אתם לא צריכים לכתוב brief.
          </p>
        </div>

        <div className="mt-12 bg-[#faf7f2] border border-stone-200 rounded-3xl p-6 md:p-8">
          <dl className="grid md:grid-cols-2 gap-x-8 gap-y-5">
            {items.map((item) => (
              <div key={item.k} className="flex items-start gap-3">
                <span className="mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(136, 63, 226, 0.1)' }}>
                  <Check className="w-3 h-3" style={{ color: INDIGO }} strokeWidth={3} />
                </span>
                <div className="flex-1">
                  <dt className="text-sm md:text-base font-semibold text-stone-800">{item.k}</dt>
                  <dd className="text-xs md:text-sm text-stone-500 mt-0.5 leading-relaxed">{item.v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Recommended() {
  // Things that genuinely require owner input — not in any public scan.
  const blocks = [
    {
      title: 'גבולות וכללים',
      subtitle: 'מה הבוט אסור עליו',
      points: [
        { k: 'מתחרים בשם', v: 'מתחרים שלא מוזכרים בפוסטים שלכם — צריך לציין שמות.' },
        { k: 'נושאים רגישים', v: 'פוליטיקה, דת, או נושאים פרסונליים שצריך לעקוף.' },
        { k: 'הצהרת אחריות', v: 'אם נדרשת חוקית: בריאות, פיננסים, יעוץ משפטי.' },
      ],
    },
    {
      title: 'יעד הלידים',
      subtitle: 'מה קורה כשמישהו רוצה לדבר',
      points: [
        { k: 'מטרת השיחה', v: 'טלפון? תיאום פגישה? קישור לרכישה?' },
        { k: 'לאן הם הולכים', v: 'אימייל? מערכת CRM שלכם? אינטגרציה לתוכנה אחרת?' },
        { k: 'שדות חובה', v: 'שם בלבד? טלפון? אימייל? פרטי הצורך?' },
      ],
    },
    {
      title: 'מוצרים פנימיים',
      subtitle: 'מה שלא מופיע באתר',
      points: [
        { k: 'B2B / סיטונאות', v: 'מחירונים, מינימום הזמנה — אם רלוונטי.' },
        { k: 'מוצרים פרטיים', v: 'ערכות מותאמות, פריטים שלא בקטלוג הציבורי.' },
        { k: 'קופונים סודיים', v: 'קוד שלא הוצג בפוסטים אבל הבוט יוכל לתת להמרות.' },
      ],
    },
    {
      title: 'תוכן ידע פנימי',
      subtitle: 'מקורות שמעבר לאתר ול-IG',
      points: [
        { k: 'PDFs / מדריכים', v: 'תקנון, מדריך שימוש, FAQ פנימי — להעלאה.' },
        { k: 'בלוגים חיצוניים', v: 'אם יש מאמרים במדיה אחרת — קישורים.' },
        { k: 'סרטוני הסבר', v: 'קישורים לסרטונים חיצוניים — נתמלל אוטומטית.' },
      ],
    },
  ];

  return (
    <section id="recommended" className="bg-[#faf7f2] py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow className="text-amber-700">מומלץ</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            מה שלא ניתן לחלץ
            <br />
            מסריקה ציבורית
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            כל מה שלמעלה אנחנו עושים לבד. אלה הדברים שאנחנו לא יכולים לדעת
            בלי שתגידו לנו.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-5">
          {blocks.map((b) => (
            <div
              key={b.title}
              className="bg-white border border-stone-200 rounded-3xl p-8 hover:border-[#b497ef] hover:shadow-xl hover:shadow-[#883fe2]/5 transition-all"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">{b.title}</h3>
                <span className="text-[10px] tracking-[0.25em] uppercase text-amber-700 font-bold">מומלץ</span>
              </div>
              <p className="text-sm text-stone-500 mt-1">{b.subtitle}</p>

              <dl className="mt-6 space-y-4">
                {b.points.map((p) => (
                  <div key={p.k} className="grid grid-cols-[110px_1fr] gap-3 items-start">
                    <dt className="text-sm font-semibold text-stone-700 pt-0.5">{p.k}</dt>
                    <dd className="text-sm text-stone-500 leading-relaxed border-r border-stone-200 pr-3">{p.v}</dd>
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

/* ------------------------------------------------------------------ */
/*  Optional + Highlights tip                                           */
/* ------------------------------------------------------------------ */

function Optional() {
  const items = [
    {
      title: 'תיקוני טון אחרי השקה',
      desc: 'הסריקה האוטומטית לרוב מדויקת — אבל אם משהו לא בדיוק "אתם", נכוון יחד. הפרסונה ניתנת לעריכה ידנית.',
    },
    {
      title: 'דשבורד אנליטיקס',
      desc: 'דוח שבועי במייל עם מספר השיחות, נושאים חמים, לידים שנפלו, ויעילות הקופונים.',
    },
    {
      title: 'התראות זמן אמת',
      desc: 'התראה כשנופל ליד חם, או כששאלה מסוימת חוזרת על עצמה — נוסיף אותה לבסיס הידע.',
    },
  ];

  return (
    <section id="optional" className="bg-white py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow className="text-stone-500" >אופציונלי</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            השדרוגים שלוקחים
            <br />
            את הבוט לרמה הבאה
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            לא חובה. אבל אם זה רלוונטי — שווה להעביר עכשיו, חוסך הקמה כפולה אחר כך.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {items.map((item) => (
            <div
              key={item.title}
              className="bg-white border border-stone-200 rounded-3xl p-7 hover:border-[#b497ef] hover:shadow-lg hover:shadow-[#883fe2]/5 transition-all"
            >
              <h3 className="text-lg font-bold text-stone-900 tracking-tight">{item.title}</h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Highlights honest callout */}
        <div className="mt-14 max-w-4xl mx-auto bg-[#faf7f2] border border-stone-200 rounded-3xl p-8 md:p-10">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(136, 63, 226, 0.08)', borderWidth: 1, borderColor: 'rgba(136, 63, 226, 0.2)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={INDIGO} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">Highlights — להיות הוגנים</h3>
              <p className="mt-3 text-sm md:text-base text-stone-600 leading-relaxed">
                Instagram מחזירה את <span className="font-semibold text-stone-800">רשימת ה-highlights</span> לכל חשבון ציבורי,
                אבל את <span className="font-semibold text-stone-800">תוכן הסטוריז שבתוכם</span> היא חוסמת באופן אלגוריתמי
                לחלק מהחשבונות העסקיים — בלי שום הגדרה ידנית שאפשר להפעיל.
              </p>

              <p className="mt-4 text-sm md:text-base text-stone-600 leading-relaxed">
                בדקנו את זה על מספר חשבונות, ובמספר דרכים שונות — אינסטגרם מחזירה את אותה
                הודעת חסימה לכולם. הדרך היחידה לעקוף זאת דורשת התחברות אקטיבית לחשבון,
                וזה לא משהו שאנחנו עושים מסיבות של אבטחה.
              </p>

              <p className="mt-4 text-sm md:text-base text-stone-600 leading-relaxed">
                <span className="font-semibold text-stone-800">המסקנה:</span> אם ה-highlights לא מצליחים להיטען —
                זה לא תקלה אצלנו. ברוב המקרים מספיקים פוסטים, תמלולי וידאו, ותוכן האתר ליצור פרסונה
                מצוינת. אם בכל זאת חשוב — מומלץ להעלות פעילות ב-Stories ולחזור לסריקה בעתיד.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  What we DON'T need                                                  */
/* ------------------------------------------------------------------ */

function DontNeed() {
  const items = [
    { k: 'סיסמת אינסטגרם', v: 'לא נכנסים לחשבון שלכם. עובדים רק עם תוכן ציבורי.' },
    { k: 'גישת אדמין לאתר', v: 'סורקים רק מה שגלוי לכל גולש רגיל.' },
    { k: 'הגדרות טכניות', v: 'כל הצד הטכני מטופל אצלנו — אתם לא נוגעים בקוד.' },
    { k: 'גישה לשרתים', v: 'הבוט והווידג׳ט רצים על התשתית שלנו.' },
  ];

  return (
    <section className="bg-stone-900 py-24 md:py-32 relative overflow-hidden">
      <div className="absolute top-0 right-1/3 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(136, 63, 226, 0.18)' }} />
      <div className="absolute bottom-0 left-1/3 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(180, 151, 239, 0.15)' }} />

      <div className="relative max-w-5xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow className="text-stone-300">מה אנחנו לא צריכים</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-white">
            ואלה הדברים שלא תצטרכו לתת
          </h2>
          <p className="text-stone-400 mt-5 text-base md:text-lg">
            אבטחה ופרטיות הם דרישת בסיס. אם מישהו מבקש מכם את אלה — סימן לדאגה.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.k} className="bg-white/5 border border-white/10 rounded-3xl p-7 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-rose-400">
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm md:text-base">{item.k}</p>
                  <p className="text-stone-400 text-xs md:text-sm mt-1.5 leading-relaxed">{item.v}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Consequences                                                        */
/* ------------------------------------------------------------------ */

function Consequences() {
  const rows = [
    { missing: 'URL אתר', impact: 'אין widget — רק עמוד צ׳אט עצמאי.' },
    { missing: 'קופונים', impact: 'הבוט לא ימליץ על דילים פעילים בזמן אמת.' },
    { missing: 'מתחרים אסורים', impact: 'הבוט עלול להזכיר אותם בתגובה לשאלה ישירה.' },
    { missing: 'הצהרת אחריות', impact: 'אם נדרשת חוקית — חובה לקבל לפני השקה.' },
    { missing: 'יעד CRM', impact: 'לידים יישלחו לאימייל בלבד, לא לתוך מערכת.' },
    { missing: 'highlights', impact: 'אין תוכן story-based בבוט (לרוב לא קריטי).' },
    { missing: 'מסמכים פנימיים', impact: 'הבוט יסיק רק מתוכן ציבורי — ידע פנימי לא נכלל.' },
  ];

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="max-w-4xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            ומה קורה אם משהו חסר?
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            הבוט עדיין יעבוד. אבל זה מה שתפסידו על כל פרט שלא יגיע.
          </p>
        </div>

        <div className="mt-12 bg-[#faf7f2] border border-stone-200 rounded-3xl overflow-hidden">
          <div className="grid grid-cols-[160px_1fr] md:grid-cols-[180px_1fr] px-6 py-4 border-b border-stone-200 text-[11px] tracking-[0.18em] uppercase text-stone-500 font-bold">
            <span>אם חסר</span>
            <span>מה קורה</span>
          </div>

          {rows.map((r, i) => (
            <div
              key={r.missing}
              className={`grid grid-cols-[160px_1fr] md:grid-cols-[180px_1fr] px-6 py-4 text-sm ${
                i < rows.length - 1 ? 'border-b border-stone-200/60' : ''
              }`}
            >
              <span className="text-stone-800 font-semibold">{r.missing}</span>
              <span className="text-stone-600 leading-relaxed">{r.impact}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Process                                                             */
/* ------------------------------------------------------------------ */

function Process() {
  const steps = [
    {
      num: '01',
      title: 'יצירת חשבון',
      desc: 'יוצרים חשבון ב-DB ומסנכרנים את כל ההגדרות הראשוניות מהפרטים שהתקבלו.',
    },
    {
      num: '02',
      title: 'סריקת אינסטגרם',
      desc: 'פרופיל, פוסטים, תגובות, highlights metadata, ותמלולים אוטומטיים של כל וידאו.',
    },
    {
      num: '03',
      title: 'סריקת אתר עמוקה',
      desc: 'גילוי כל המוצרים והדפים, חילוץ נתונים, והעשרה עם AI profiles + תמונות.',
    },
    {
      num: '04',
      title: 'בניית פרסונה',
      desc: 'הרכבת פרסונה עם כל ההוראות, הטון, וההגבלות שהוגדרו — מותאם אישית לכם.',
    },
    {
      num: '05',
      title: 'קונפיגורציית widget',
      desc: 'הגדרת theme, צבעים, FAQ, ומיפוי המוצרים — אם רלוונטי לאתר.',
    },
    {
      num: '06',
      title: 'בדיקה מקצה לקצה',
      desc: 'שאילתות בעברית ובאנגלית, ולידציית תמונות, אימות קופונים, ותרחישי קצה.',
    },
  ];

  return (
    <section id="process" className="bg-[#faf7f2] py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow className="text-emerald-700">התהליך</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            ככה זה זורם
            <br />
            אחרי שאתם שולחים
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            6 שלבים. הכל אצלנו. אתם רק יושבים ומחכים שהבוט יעלה.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {steps.map((s) => (
            <div key={s.num} className="bg-white border border-stone-200 rounded-3xl p-7 h-full hover:border-[#b497ef] hover:shadow-xl hover:shadow-[#883fe2]/5 transition-all group">
              <span className="font-black text-5xl text-stone-100 tracking-[-0.05em] group-hover:text-[#e6dbfa] transition-colors">
                {s.num}
              </span>
              <h3 className="mt-3 text-lg md:text-xl font-bold text-stone-900 tracking-tight">{s.title}</h3>
              <p className="mt-2 text-stone-600 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <div
          className="mt-14 max-w-2xl mx-auto rounded-3xl p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(136,63,226,0.06) 0%, rgba(255,255,255,0.5) 50%, rgba(180,151,239,0.06) 100%)',
            borderWidth: 1,
            borderColor: 'rgba(136, 63, 226, 0.15)',
          }}
        >
          <p className="text-sm text-stone-500">זמן כולל מרגע שהפרטים אצלנו ועד שהבוט באוויר</p>
          <p className="font-black tracking-[-0.04em] text-4xl md:text-6xl text-stone-900 mt-3">24–48 שעות</p>
          <p className="text-sm text-stone-500 mt-3">
            כולל סריקה, בניית פרסונה, רביזיה ואישור לפני שהבוט עולה לפרודקשן.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA Form                                                            */
/* ------------------------------------------------------------------ */

function CTAForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    instagram: '',
    website: '',
    type: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setSubmitting(true);

    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'onboarding-guide',
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          message: [
            form.instagram && `Instagram: @${form.instagram.replace(/^@/, '')}`,
            form.website && `Website: ${form.website}`,
            form.type && `Type: ${form.type}`,
            form.message && `Notes: ${form.message}`,
          ].filter(Boolean).join('\n'),
        }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // still show success — don't trap user on transient error
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full px-4 py-3.5 rounded-2xl bg-white border border-stone-200 text-stone-900 text-sm placeholder-stone-400 focus:border-[#883fe2] focus:ring-2 focus:ring-[#883fe2]/15 outline-none transition-all';

  return (
    <section id="form" className="relative overflow-hidden bg-white py-24 md:py-32">
      <div className="pointer-events-none absolute top-1/4 right-[-10%] w-[500px] h-[500px] rounded-full bg-[#b497ef]/25 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-[-10%] w-[400px] h-[400px] rounded-full bg-[#883fe2]/15 blur-[120px]" />

      <div className="relative max-w-xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="text-center">
          <Eyebrow className="text-stone-500">מוכנים?</Eyebrow>
          <h2 className="mt-6 font-black tracking-[-0.03em] text-3xl md:text-5xl text-stone-900">
            בואו נתחיל
          </h2>
          <p className="text-stone-600 mt-5 text-base md:text-lg">
            השאירו פרטים ונחזור אליכם עם הצעה ושאלון אונבורדינג מסודר.
          </p>
        </div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mt-12 text-center bg-white border border-stone-200 rounded-3xl p-12 shadow-sm"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-500" strokeWidth={2.5} />
            </div>
            <h3 className="mt-6 text-2xl font-bold text-stone-900">קיבלנו</h3>
            <p className="mt-3 text-stone-600 text-base leading-relaxed">
              נחזור אליכם עם שאלון האונבורדינג המלא והצעה.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-12 bg-white border border-stone-200 rounded-3xl p-7 md:p-8 space-y-3 shadow-sm">
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
            <textarea
              placeholder="משהו שכדאי לדעת? (אופציונלי)"
              value={form.message}
              onChange={(e) => set('message', e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
            />

            <button
              type="submit"
              disabled={submitting || !form.name || !form.email}
              className="w-full py-4 rounded-2xl bg-stone-900 text-white font-semibold text-sm hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>שולח...</span>
                </>
              ) : (
                <>
                  שלחו לי את שאלון האונבורדינג
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-xs text-stone-400 pt-2">
              בלי כרטיס אשראי. בלי התחייבות.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="bg-[#faf7f2] border-t border-stone-200 py-12">
      <div className="max-w-7xl mx-auto px-5 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4" dir="rtl">
        <div className="flex items-center gap-3">
          <Image src="/brand/bestie-wordmark.svg" alt="BestieAI" width={140} height={36} className="h-7 w-auto" />
          <span className="text-stone-400 text-sm">by LDRS Group</span>
        </div>
        <p className="text-stone-400 text-xs">© 2026 BestieAI. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function OnboardingGuidePage() {
  return (
    <main className="bg-white text-stone-900 antialiased" style={{ fontFamily: "'Heebo', 'Inter', sans-serif" }}>
      <style jsx global>{`
        html { scroll-behavior: smooth; }
      `}</style>
      <Grain />
      <Navbar />
      <Hero />
      <Numbers />
      <Required />
      <AutoExtracted />
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
