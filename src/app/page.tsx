'use client';

/* ==========================================================================
   BestieAI — Public Landing Page (root "/")
   Brand-aligned: 99 mark (indigo + peach), warm, friendly, confident.
   Real capabilities only. Form posts to /api/briefs.
   ========================================================================== */

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
} from 'framer-motion';
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  ChevronDown,
  Loader2,
  Send,
} from 'lucide-react';
import { Marquee } from '@/components/ui/marquee';
import MagicBento from '@/components/ui/magic-bento';
import {
  MessageSquare,
  Code2,
  FileText,
  LayoutDashboard,
  Instagram,
  MessageCircle,
} from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Brand tokens                                                       */
/* ------------------------------------------------------------------ */

const INDIGO = '#6366f1';
const PEACH = '#f9b65f';

/* ------------------------------------------------------------------ */
/*  Grain texture overlay — subtle warmth                              */
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
/*  MiniMark — small inline 99 used as decoration                      */
/* ------------------------------------------------------------------ */

function MiniMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/faclogo.png"
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Eyebrow                                                            */
/* ------------------------------------------------------------------ */

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
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */

function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const navBg = useTransform(scrollY, [0, 80], ['rgba(250, 247, 242, 0)', 'rgba(250, 247, 242, 0.85)']);
  const navBorder = useTransform(scrollY, [0, 80], ['rgba(28, 25, 23, 0)', 'rgba(28, 25, 23, 0.08)']);

  const links = [
    { href: '#demo', label: 'דמו חי' },
    { href: '#capabilities', label: 'יכולות' },
    { href: '#how', label: 'איך זה עובד' },
    { href: '#faq', label: 'שאלות' },
  ];

  return (
    <motion.nav
      style={{ backgroundColor: navBg, borderColor: navBorder }}
      className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl border-b"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-8 h-16" dir="rtl">
        <Link href="#hero" className="flex items-center shrink-0">
          <Image src="/logo.png" alt="BestieAI" width={180} height={40} priority className="h-7 md:h-8 w-auto" />
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
          <Link
            href="/admin"
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            כניסה למערכת
          </Link>
          <a
            href="#contact"
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-stone-900 text-stone-50 text-sm font-semibold
                       hover:bg-stone-800 transition-all"
          >
            מעוניינים לשמוע
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          </a>
        </div>

        <button
          aria-label="תפריט"
          className="md:hidden text-stone-800 p-1"
          onClick={() => setOpen((v) => !v)}
        >
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
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block text-base text-stone-700"
                >
                  {l.label}
                </a>
              ))}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
                <Link href="/admin" className="text-sm text-stone-600" onClick={() => setOpen(false)}>
                  כניסה למערכת
                </Link>
                <a
                  href="#contact"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-stone-900 text-stone-50 text-xs font-semibold"
                >
                  שלחו פנייה
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
/*  Hero — live breathing 99 mark + oversized headline                 */
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
        src="/faclogo.png"
        alt=""
        width={820}
        height={820}
        priority
        className="w-[260px] sm:w-[340px] md:w-[440px] lg:w-[560px] h-auto drop-shadow-[0_30px_60px_rgba(99,102,241,0.25)]"
      />
    </motion.div>
  );
}

function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-[100svh] pt-28 md:pt-32 pb-16 overflow-hidden bg-[#faf7f2] text-stone-900"
    >
      {/* atmospheric color */}
      <div className="pointer-events-none absolute top-10 right-[-20%] w-[700px] h-[700px] rounded-full bg-[#f9b65f]/30 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 left-[-15%] w-[600px] h-[600px] rounded-full bg-[#6366f1]/25 blur-[140px]" />

      <div className="relative max-w-7xl w-full mx-auto px-5 md:px-8 h-full">
        {/* Top row: headline left / mark right (RTL: headline right / mark left) */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-6 items-center pt-6 md:pt-8">
          {/* Headline (RTL → visual right) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE }}
            className="lg:col-span-7 order-2 lg:order-1"
            dir="rtl"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-stone-200 shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-stone-600">חשבונות פעילים · עונה בפחות מ-3 שניות</span>
            </motion.div>

            <h1
              className="mt-6 font-black tracking-[-0.04em] leading-[0.88] text-stone-900"
              style={{ fontSize: 'clamp(2.75rem, 9vw, 7.75rem)' }}
            >
              התוכן שלך
              <br />
              <span className="relative inline-block">
                <span className="relative z-10">יודע לדבר</span>
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
                    transition={{ duration: 1.4, delay: 0.9, ease: EASE }}
                  />
                </svg>
              </span>
              <br />
              <span className="text-stone-400">חזרה.</span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
              className="mt-8 text-lg md:text-xl text-stone-600 leading-[1.55] max-w-xl"
            >
              BestieAI סורק כל פוסט, רילס וסטורי שפרסמתם. מתמלל סרטונים,
              קורא את האתר, ובונה AI שעונה לעוקבים באינסטגרם, באתר,
              ובוואטסאפ — בקול שלכם, בעברית, מסביב לשעון.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <a
                href="#contact"
                className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-sm text-stone-900 overflow-hidden
                           shadow-[0_10px_30px_-8px_rgba(99,102,241,0.5)] hover:shadow-[0_16px_40px_-8px_rgba(99,102,241,0.6)] transition-shadow"
              >
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ background: `linear-gradient(115deg, ${INDIGO} 0%, #a78bfa 45%, ${PEACH} 100%)` }}
                />
                <span className="absolute inset-[2px] rounded-full bg-[#faf7f2] group-hover:bg-white transition-colors" />
                <span className="relative">מעוניינים לשמוע עוד</span>
                <ArrowLeft className="relative w-4 h-4 transition-transform group-hover:-translate-x-1" />
              </a>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-stone-300 text-stone-700 text-sm font-medium
                           hover:border-stone-900 hover:text-stone-900 transition-all"
              >
                נסו דמו חי
              </a>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-5 text-xs text-stone-400 tracking-wide"
            >
              ללא כרטיס אשראי · ללא קוד · ללא התחייבות
            </motion.p>
          </motion.div>

          {/* Mark (RTL → visual left) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
            className="lg:col-span-5 order-1 lg:order-2 flex justify-center lg:justify-end"
          >
            <MouseParallaxMark />
          </motion.div>
        </div>
      </div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-stone-400"
      >
        <span>scroll</span>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="w-px h-5 bg-stone-400"
        />
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Interactive Demo — click a prompt, watch the bot type a reply      */
/* ------------------------------------------------------------------ */

type DemoEntry = { q: string; a: string; tag: string };

const DEMO_ENTRIES: DemoEntry[] = [
  {
    tag: 'טיפוח',
    q: 'היי, ראיתי את הרילס על הסרום לפנים — איזה מותג זה?',
    a: 'זה הסרום ויטמין C של ארגניה. הצגתי אותו בסטורי מיום שלישי, אני משתמשת בו כבר שלושה חודשים. יש קוד הנחה BESTIE15 ל-15%. רוצה שאשלח לינק?',
  },
  {
    tag: 'אופנה',
    q: 'איפה קנית את השמלה מהפוסט של אתמול?',
    a: 'היא של Zara מהקולקציה החדשה — הוספתי את הלינק לסיפור המוצמד "קניות השבוע". אגב, יש לי גם בגרסה שחורה אם את מעדיפה.',
  },
  {
    tag: 'שת״פ',
    q: 'שלום, אני מ-Brand X — מתעניינים בשת״פ. מה התעריפים שלך?',
    a: 'נעים להכיר. את הפרטים הטכניים ותעריפים מטפלת המנהלת שלי — מעבירה אותך אליה: sara@ldrs.co. תוכלי לשלוח בריף קצר עם המטרות?',
  },
  {
    tag: 'בישול',
    q: 'מתי המתכון לעוגת השוקולד שהבטחת?',
    a: 'שמתי אותו בפוסט מיום שני — שמרתי גם בהיילייט "מתכונים". הטיפ הכי חשוב: חמאה ב-20°C, לא 22, וגם לא מקצפים יותר מ-3 דקות.',
  },
];

function useTyping(text: string, active: boolean, speed = 22) {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!active) return;
    setOut('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);
  return out;
}

function InteractiveDemo() {
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'typing' | 'done'>('idle');

  const entry = DEMO_ENTRIES[selected];
  const typed = useTyping(entry.a, phase === 'typing');
  const done = phase === 'typing' && typed === entry.a;

  useEffect(() => {
    if (done) setPhase('done');
  }, [done]);

  function run(idx: number) {
    setSelected(idx);
    setPhase('thinking');
    window.setTimeout(() => setPhase('typing'), 700);
  }

  // auto-run first on mount via intersection
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && phase === 'idle') {
          run(0);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section id="demo" ref={ref} className="relative bg-white py-24 md:py-32 border-y border-stone-200/60">
      <div className="max-w-7xl mx-auto px-5 md:px-8 grid lg:grid-cols-12 gap-10 lg:gap-16 items-start" dir="rtl">
        <div className="lg:col-span-5 lg:sticky lg:top-28">
          <Eyebrow className="text-stone-500">דמו חי</Eyebrow>
          <h2
            className="mt-5 font-black tracking-[-0.03em] leading-[0.92] text-stone-900"
            style={{ fontSize: 'clamp(2rem, 5.5vw, 4.5rem)' }}
          >
            לחצו על שאלה.
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(95deg, ${INDIGO}, ${PEACH})` }}
            >
              תראו איך הוא עונה.
            </span>
          </h2>

          <p className="mt-6 text-stone-600 leading-relaxed max-w-md">
            אלה לא תסריטים. הבוט מייצר תשובה חדשה בכל פעם,
            מבוססת על התוכן האמיתי של היוצר.
          </p>

          <div className="mt-8 space-y-2">
            {DEMO_ENTRIES.map((d, i) => (
              <button
                key={d.q}
                onClick={() => run(i)}
                className={`w-full text-right p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                  i === selected
                    ? 'bg-stone-900 border-stone-900 text-stone-50'
                    : 'bg-[#faf7f2] border-stone-200 text-stone-700 hover:border-stone-400'
                }`}
              >
                <span
                  className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                    i === selected ? 'bg-white/15 text-stone-50' : 'bg-white text-stone-500 border border-stone-200'
                  }`}
                >
                  {d.tag}
                </span>
                <span className="text-sm leading-snug">{d.q}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="relative">
            {/* glow */}
            <div
              className="absolute -inset-8 rounded-[3rem] blur-3xl opacity-40"
              style={{ background: `radial-gradient(circle at 30% 30%, ${INDIGO}50, transparent 60%), radial-gradient(circle at 80% 80%, ${PEACH}50, transparent 60%)` }}
            />

            <div className="relative bg-white rounded-[2rem] border border-stone-200 shadow-2xl shadow-stone-900/10 overflow-hidden">
              {/* app chrome */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-stone-100 bg-[#faf7f2]/60">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                </div>
                <div className="flex items-center gap-2 mx-auto text-xs text-stone-500" dir="rtl">
                  <MiniMark size={14} />
                  <span>your_brand · Direct</span>
                </div>
                <div className="w-10" />
              </div>

              {/* messages */}
              <div className="p-6 md:p-8 min-h-[380px] flex flex-col justify-end gap-3 text-sm" dir="rtl">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`q-${selected}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex justify-start"
                  >
                    <div className="bg-stone-100 text-stone-800 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[78%]">
                      {entry.q}
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="flex justify-end">
                  <div
                    className="relative rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[78%] text-stone-900 min-h-[2.5rem]"
                    style={{
                      background: `linear-gradient(135deg, ${INDIGO}12, ${PEACH}20)`,
                      border: `1px solid ${INDIGO}20`,
                    }}
                  >
                    {phase === 'thinking' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-1 py-1"
                      >
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </motion.div>
                    )}
                    {(phase === 'typing' || phase === 'done') && (
                      <span className="leading-relaxed">
                        {typed}
                        {phase === 'typing' && (
                          <span className="inline-block w-[2px] h-4 align-middle bg-stone-400 animate-pulse ml-0.5" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* fake composer */}
              <div className="px-5 py-4 border-t border-stone-100 bg-[#faf7f2]/40 flex items-center gap-3">
                <div className="flex-1 h-10 rounded-full bg-white border border-stone-200" />
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                  style={{ background: `linear-gradient(135deg, ${INDIGO}, ${PEACH})` }}
                >
                  <Send className="w-4 h-4" />
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-stone-400 text-center flex items-center justify-center gap-2">
              <span className="w-4 h-px bg-stone-300" />
              תשובות לדוגמה — הבוט האמיתי שלכם מחובר לתוכן שלכם
              <span className="w-4 h-px bg-stone-300" />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  DM Marquee                                                         */
/* ------------------------------------------------------------------ */

type DM = { q: string; a: string; tag: string };

const DMS_ROW_1: DM[] = [
  { q: 'היי, ראיתי את הרילס על הסרום — איזה מותג זה?', a: 'זה סרום ויטמין C, הצגתי אותו בסטורי ביום שלישי. רוצה לינק?', tag: 'טיפוח' },
  { q: 'יש המלצה למתכון מהיר לערב?', a: 'בהיילייט "מתכונים" יש פסטה ב-15 דקות שכולם אוהבים.', tag: 'בישול' },
  { q: 'מאיפה השמלה מהפוסט האחרון?', a: 'מ-ZARA, הקולקציה החדשה. הלינק בהיילייט "קניות השבוע".', tag: 'אופנה' },
  { q: 'יש קוד הנחה למותג הזה?', a: 'כן! קוד BESTIE15 נותן 15% הנחה, תקף עד סוף החודש.', tag: 'קופונים' },
  { q: 'איזה קרם פנים את ממליצה לעור יבש?', a: 'הקרם מהרילס מלפני שבועיים — עם חמאת שיאה. מתאים בדיוק ליובש.', tag: 'טיפוח' },
  { q: 'מגיעה לאירוע בת״א?', a: 'כן, דוברת ביום חמישי ב-18:00. כל הפרטים בהיילייט.', tag: 'אירועים' },
];

const DMS_ROW_2: DM[] = [
  { q: 'איך משלבים ספורט עם ילדים קטנים?', a: 'עשיתי על זה פוסט שלם — חפשי "בוקר רגיל" בפיד.', tag: 'הורות' },
  { q: 'מה התרגיל הכי טוב לבוקר מהיר?', a: '15 דקות בלי ציוד, מופיע בסטורי של יום ראשון.', tag: 'כושר' },
  { q: 'עובדת עם המותג הזה?', a: 'כן, שת״פ גלוי. הם נתנו קוד הנחה בלעדי לעוקבים שלי.', tag: 'שת״פ' },
  { q: 'מאיפה העגילים מהסטורי?', a: 'מהקולקציה החדשה של Shani Arieli — בסטורי יש את הקרדיט.', tag: 'אופנה' },
  { q: 'ראיתי את המלצת הספר, יש עוד כאלה?', a: 'בהיילייט "קריאה" יש 12 המלצות מהשנה האחרונה.', tag: 'המלצות' },
  { q: 'את עושה סדנאות אונליין?', a: 'הסדנה הבאה ביום שני, הרשמה דרך הלינק בביו.', tag: 'אירועים' },
];

function DMBubble({ dm }: { dm: DM }) {
  return (
    <div className="w-[320px] md:w-[380px] shrink-0 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-sm" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[10px] tracking-wide font-medium">
          {dm.tag}
        </span>
      </div>
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-start">
          <div className="bg-stone-100 text-stone-700 rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[88%]">
            {dm.q}
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="rounded-2xl rounded-tl-sm px-3.5 py-2 max-w-[88%] text-stone-800 border"
            style={{
              background: `linear-gradient(135deg, ${INDIGO}10, ${PEACH}18)`,
              borderColor: `${INDIGO}25`,
            }}
          >
            {dm.a}
          </div>
        </div>
      </div>
    </div>
  );
}

function DMShowcase() {
  return (
    <section className="relative bg-[#faf7f2] py-20 md:py-24 overflow-hidden border-y border-stone-200/60">
      <div className="max-w-7xl mx-auto px-5 md:px-8 mb-10" dir="rtl">
        <Eyebrow className="text-stone-500">בזמן שאתם ישנים</Eyebrow>
        <h2
          className="mt-4 font-black tracking-[-0.03em] leading-[0.95] text-stone-900 max-w-3xl"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
        >
          שיחות אמיתיות שהבוט מטפל בהן.
        </h2>
      </div>

      <div className="space-y-5">
        <Marquee gap="1.25rem" duration={50} pauseOnHover className="[--gap:1.25rem]">
          {DMS_ROW_1.map((dm, i) => (
            <DMBubble key={`r1-${i}`} dm={dm} />
          ))}
        </Marquee>
        <Marquee gap="1.25rem" duration={60} reverse pauseOnHover className="[--gap:1.25rem]">
          {DMS_ROW_2.map((dm, i) => (
            <DMBubble key={`r2-${i}`} dm={dm} />
          ))}
        </Marquee>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 md:w-48 bg-gradient-to-l from-[#faf7f2] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 md:w-48 bg-gradient-to-r from-[#faf7f2] to-transparent" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Moment of Recognition — warm ink section                           */
/* ------------------------------------------------------------------ */

function MomentOfRecognition() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [80, -80]);

  return (
    <section ref={ref} className="relative bg-[#181410] text-stone-50 py-28 md:py-40 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(255 255 255) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 70% 30%, ${INDIGO}22, transparent 60%), radial-gradient(ellipse 50% 40% at 20% 80%, ${PEACH}22, transparent 60%)`,
        }}
      />

      <motion.div
        style={{ y }}
        className="pointer-events-none absolute top-10 right-4 md:right-10 flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase text-stone-500"
      >
        <MiniMark size={14} className="opacity-80" />
        BestieAI
      </motion.div>

      <div className="relative max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <Eyebrow className="text-stone-400">רגע של כנות</Eyebrow>

        <div className="mt-10 grid md:grid-cols-12 gap-8 items-start">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, ease: EASE }}
            className="md:col-span-8"
          >
            <h2
              className="font-black tracking-[-0.03em] leading-[0.92]"
              style={{ fontSize: 'clamp(2.25rem, 7vw, 6.25rem)' }}
            >
              חמישים אלף עוקבים.
              <br />
              שלוש־מאות הודעות ביום.
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
            className="md:col-span-4 md:pt-8"
          >
            <div className="md:border-r md:border-stone-700 md:pr-6">
              <p className="text-lg leading-relaxed text-stone-300">
                כל אחת מהן יכולה להיות שת״פ, רכישה, לקוחה לחיים.
              </p>
              <p className="mt-5 text-lg leading-relaxed text-stone-300">
                ביממה יש 24 שעות — ואתם לא מכונה.
              </p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 1, delay: 0.25, ease: EASE }}
          className="mt-20 md:mt-28 pt-12 border-t border-stone-800 flex items-end justify-between gap-6 flex-wrap"
        >
          <h3
            className="font-black tracking-[-0.03em] leading-[0.9] bg-clip-text text-transparent"
            style={{
              fontSize: 'clamp(2.5rem, 8vw, 6.5rem)',
              backgroundImage: `linear-gradient(100deg, #ffd6a5, ${PEACH}, #c7d2fe, ${INDIGO})`,
            }}
          >
            עכשיו יש לכם אחת.
          </h3>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <MiniMark size={20} className="opacity-80" />
            <div className="w-8 h-px bg-stone-600" />
            <span>BestieAI</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Capabilities — MagicBento                                          */
/* ------------------------------------------------------------------ */

const BENTO_CARDS = [
  {
    title: 'צ׳אטבוט שמדבר בקול שלכם',
    description: '12 ארכיטיפים — טיפוח, אופנה, בישול, כושר, הורות, קופונים ועוד. הסגנון, ההומור והקווים האדומים שלכם — מובנים לתוך הבוט.',
    label: 'צ׳אטבוט',
    color: '#1a1a2e',
    icon: <MessageSquare className="w-5 h-5 text-white" />,
  },
  {
    title: 'וידג׳ט צ׳אט לאתר',
    description: 'שורת JavaScript אחת, והוא חי באתר שלכם. עונה על מוצרים, קופונים ותוכן — בזמן אמת.',
    label: 'אתר',
    color: '#1e1b2e',
    icon: <Code2 className="w-5 h-5 text-white" />,
  },
  {
    title: 'ניתוח חוזים ובריפים',
    description: 'PDF, תמונה או Word — ה-AI מחלץ סכום, תאריכים, תנאים ודדליינים. שרשרת AI חכמה. 4 שפות.',
    label: 'מסמכים',
    color: '#1a2a1e',
    icon: <FileText className="w-5 h-5 text-white" />,
  },
  {
    title: 'דשבורד ניהולי מלא',
    description: 'אנליטיקס, שת״פים, הכנסות, קופונים, מסמכים, היסטוריית שיחות ופרסונה — הכול במקום אחד.',
    label: 'דשבורד',
    color: '#1a1a2e',
    icon: <LayoutDashboard className="w-5 h-5 text-white" />,
  },
  {
    title: 'סריקת אינסטגרם + פרסונה',
    description: 'פוסטים, רילסים, סטוריז, היילייטס ותגובות נסרקים ונבנים ל-RAG חי. הפרסונה נבנית אוטומטית מהתוכן.',
    label: 'אינסטגרם',
    color: '#2a1a2e',
    icon: <Instagram className="w-5 h-5 text-white" />,
  },
  {
    title: 'התראות WhatsApp',
    description: 'דייג׳סט שבועי, ברוכים הבאים, תמיכה — על WhatsApp Cloud API הרשמי.',
    label: 'WhatsApp',
    color: '#1a2e24',
    icon: <MessageCircle className="w-5 h-5 text-white" />,
  },
];

function Capabilities() {
  return (
    <section id="capabilities" className="relative bg-[#faf7f2] py-28 md:py-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14 md:mb-20">
          <div>
            <Eyebrow className="text-stone-500">מה זה עושה</Eyebrow>
            <h2
              className="mt-5 font-black tracking-[-0.03em] leading-[0.9] text-stone-900"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 5.5rem)' }}
            >
              שש יכולות.
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(95deg, ${INDIGO}, ${PEACH})` }}
              >
                כולן אמיתיות.
              </span>
            </h2>
          </div>
          <p className="text-stone-500 text-sm leading-relaxed max-w-sm md:text-left">
            ללא באזוורדס, ללא הבטחות שיווקיות.
            רק מה שהמערכת עושה היום עבור חשבונות אמיתיים.
          </p>
        </div>

        <MagicBento
          cards={BENTO_CARDS}
          textAutoHide={true}
          enableStars={true}
          enableSpotlight={true}
          enableBorderGlow={true}
          enableTilt={true}
          enableMagnetism={true}
          clickEffect={true}
          spotlightRadius={300}
          particleCount={10}
          glowColor="99, 102, 241"
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How It Works                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'מחברים חשבון',
      body: 'כניסה אחת לאינסטגרם. בלי קוד, בלי הגדרות, בלי טכנאי.',
      detail: 'תמיכה ב-OAuth 2.0 ואימות דו-שלבי.',
    },
    {
      num: '02',
      title: 'ה-AI לומד אתכם',
      body: 'פוסטים, רילסים, סטוריז והיילייטס נסרקים ומתומללים. הפרסונה נבנית מהתוכן עצמו — הסגנון, המוצרים, הקופונים, והדברים שלא עושים.',
      detail: 'סריקה חוזרת כל 24 שעות. עברית, אנגלית, ערבית, רוסית.',
    },
    {
      num: '03',
      title: 'הבוט עולה לאוויר',
      body: 'עונה ב-DM, באתר וב-WhatsApp — בעברית, בקול שלכם, מסביב לשעון.',
      detail: 'סיכום שיחות שבועי לאימייל. כל שיחה לא ברורה עולה לסקירה.',
    },
  ];

  return (
    <section id="how" className="relative bg-white py-28 md:py-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="mb-20 max-w-3xl">
          <Eyebrow className="text-stone-500">איך זה עובד</Eyebrow>
          <h2
            className="mt-5 font-black tracking-[-0.03em] leading-[0.9] text-stone-900"
            style={{ fontSize: 'clamp(2.25rem, 6vw, 5.5rem)' }}
          >
            שלושה שלבים.
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(95deg, ${INDIGO}, ${PEACH})` }}
            >
              ללא טכנאי.
            </span>
          </h2>
        </div>

        <div className="relative">
          <div className="hidden md:block absolute top-0 bottom-0 right-[calc(8rem-1px)] w-px bg-gradient-to-b from-transparent via-stone-300 to-transparent" />

          <div className="space-y-14 md:space-y-20">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.8, ease: EASE, delay: i * 0.1 }}
                className="grid md:grid-cols-[8rem_1fr] gap-6 md:gap-16 items-start"
              >
                <div className="relative">
                  <span
                    className="font-black tracking-[-0.05em] leading-none block bg-clip-text text-transparent"
                    style={{
                      fontSize: 'clamp(4rem, 9vw, 9rem)',
                      backgroundImage: `linear-gradient(145deg, ${INDIGO} 0%, #a78bfa 50%, ${PEACH} 100%)`,
                    }}
                  >
                    {s.num}
                  </span>
                  <span
                    className="hidden md:block absolute top-1/2 -left-px -translate-y-1/2 w-3 h-3 rounded-full ring-4 ring-white"
                    style={{ background: INDIGO }}
                  />
                </div>

                <div className="md:pt-6 max-w-2xl">
                  <h3 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight leading-tight">
                    {s.title}
                  </h3>
                  <p className="mt-4 text-lg text-stone-600 leading-relaxed">{s.body}</p>
                  <p className="mt-4 text-xs tracking-wide uppercase text-stone-400 flex items-center gap-2">
                    <span className="w-5 h-px bg-stone-300" />
                    {s.detail}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
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
      q: 'באילו שפות זה עובד?',
      a: 'עברית (ראשית), אנגלית, ערבית ורוסית. שפת התשובה נקבעת לפי שפת הפנייה של העוקב.',
    },
    {
      q: 'מה קורה כשהבוט לא בטוח בתשובה?',
      a: 'הוא לא ממציא. מסמן את השיחה, שולח לכם התראה, אתם עונים — והוא לומד. לא חוזר עם אותה שאלה פעמיים.',
    },
    {
      q: 'מה עם פרטיות של השיחות והנתונים?',
      a: 'כל חשבון בסביבה מבודדת לחלוטין (multi-tenant עם Row-Level Security). שיחות מוצפנות בתעבורה, הגישה רק שלכם.',
    },
    {
      q: 'כמה זמן לוקח להקים?',
      a: 'מחיבור לאינסטגרם עד בוט פעיל: 30 דקות עד כמה שעות, תלוי בכמות התוכן. הסריקה רצה ברקע.',
    },
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-[#faf7f2] py-28 md:py-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-12 gap-10 md:gap-20" dir="rtl">
        <div className="md:col-span-5 md:sticky md:top-32 md:self-start">
          <Eyebrow className="text-stone-500">שאלות</Eyebrow>
          <h2
            className="mt-5 font-black tracking-[-0.03em] leading-[0.9] text-stone-900"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 4.5rem)' }}
          >
            מה כולם
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(95deg, ${INDIGO}, ${PEACH})` }}
            >
              שואלים.
            </span>
          </h2>
          <p className="mt-6 text-sm text-stone-500 max-w-sm leading-relaxed">
            לא מצאתם תשובה? השאירו פרטים בטופס למטה.
          </p>
        </div>

        <div className="md:col-span-7">
          <div className="divide-y divide-stone-300/60 border-y border-stone-300/60">
            {qs.map((item, i) => {
              const isOpen = openIdx === i;
              return (
                <div key={item.q} className="group">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 py-6 md:py-7 text-right"
                  >
                    <span className="text-lg md:text-2xl font-bold text-stone-900 tracking-tight transition-colors group-hover:text-stone-600">
                      {item.q}
                    </span>
                    <span
                      className={`shrink-0 w-10 h-10 rounded-full border border-stone-300 flex items-center justify-center transition-all
                                  ${isOpen ? 'rotate-180' : ''}`}
                      style={isOpen ? { background: `linear-gradient(135deg, ${INDIGO}, ${PEACH})`, borderColor: 'transparent' } : {}}
                    >
                      <ChevronDown className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-stone-500'}`} />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="pb-7 text-stone-600 leading-[1.7] text-base md:text-lg max-w-xl">
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
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA / Form                                                         */
/* ------------------------------------------------------------------ */

function CtaForm() {
  type BizType = 'יוצר/ת תוכן' | 'מותג' | 'סוכנות' | 'אחר';

  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
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
    'w-full px-0 py-4 bg-transparent border-0 border-b text-stone-50 placeholder:text-stone-600 ' +
    'focus:outline-none transition-colors text-base border-stone-700 focus:border-stone-50';

  return (
    <section id="contact" className="relative bg-[#181410] text-stone-50 py-28 md:py-40 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(255 255 255) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background: `radial-gradient(ellipse 50% 40% at 20% 30%, ${INDIGO}30, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, ${PEACH}25, transparent 60%)`,
        }}
      />

      <div className="relative max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-12 gap-12 md:gap-16" dir="rtl">
        <div className="md:col-span-5">
          <Eyebrow className="text-stone-400">בואו נדבר</Eyebrow>
          <h2
            className="mt-6 font-black tracking-[-0.03em] leading-[0.9]"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 6rem)' }}
          >
            מעוניינים
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(100deg, #ffd6a5, ${PEACH}, #c7d2fe, ${INDIGO})` }}
            >
              לשמוע עוד?
            </span>
          </h2>

          <p className="mt-8 text-stone-400 leading-relaxed max-w-md">
            השאירו פרטים — נחזור תוך 24 שעות עם דמו מותאם לתוכן שלכם.
            בלי ספאם, בלי מכירה בכוח, בלי ניוזלטר שלא ביקשתם.
          </p>

          <div className="mt-10 flex items-center gap-3 text-xs tracking-wide text-stone-500">
            <MiniMark size={18} className="opacity-80" />
            ממוצע תגובה: 4 שעות בשעות העבודה.
          </div>
        </div>

        <div className="md:col-span-7">
          <AnimatePresence mode="wait">
            {state === 'success' ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 backdrop-blur rounded-3xl p-10 md:p-14"
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${INDIGO}, ${PEACH})` }}
                >
                  <Check className="w-7 h-7 text-white" />
                </div>
                <h3
                  className="mt-6 font-black tracking-[-0.03em] leading-tight"
                  style={{ fontSize: 'clamp(1.75rem, 3.5vw, 3rem)' }}
                >
                  קיבלנו.
                  <br />
                  <span className="text-stone-500">מדברים בקרוב.</span>
                </h3>
                <p className="mt-6 text-stone-400 leading-relaxed">
                  נחזור אליכם תוך 24 שעות — לרוב הרבה יותר מהר.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                className="space-y-2"
              >
                <div className="grid md:grid-cols-2 gap-8 gap-y-2">
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">שם מלא</label>
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
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">סוג העסק</label>
                    <div className="relative">
                      <select
                        value={form.bizType}
                        onChange={(e) => setForm({ ...form, bizType: e.target.value as BizType })}
                        className={`${inputCls} appearance-none pl-6 cursor-pointer [&>option]:bg-stone-900 [&>option]:text-stone-50`}
                      >
                        <option value="">בחרו</option>
                        <option value="יוצר/ת תוכן">יוצר/ת תוכן</option>
                        <option value="מותג">מותג</option>
                        <option value="סוכנות">סוכנות</option>
                        <option value="אחר">אחר</option>
                      </select>
                      <ChevronDown className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">אימייל</label>
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
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">טלפון</label>
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

                <div className="pt-4">
                  <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">
                    ספרו לנו קצת <span className="text-stone-600 normal-case tracking-normal">(אופציונלי)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={`${inputCls} resize-none`}
                    placeholder="כמה עוקבים, איזה תחום, ומה הכי מפריע לכם היום"
                  />
                </div>

                {error && <p className="text-sm text-rose-300 pt-2">{error}</p>}

                <div className="pt-8 flex flex-col sm:flex-row sm:items-center gap-4">
                  <button
                    type="submit"
                    disabled={state === 'submitting'}
                    className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-semibold text-sm text-stone-900 overflow-hidden
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: `linear-gradient(115deg, ${INDIGO}, #a78bfa, ${PEACH})` }}
                    />
                    <span className="relative flex items-center gap-2 text-stone-900">
                      {state === 'submitting' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          שולח…
                        </>
                      ) : (
                        <>
                          שלחו פנייה
                          <ArrowUpLeft className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:-translate-x-0.5" />
                        </>
                      )}
                    </span>
                  </button>
                  <p className="text-xs text-stone-500">
                    נחזור תוך 24 שעות · ללא ספאם · ללא ניוזלטר
                  </p>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer — giant logo lockup                                          */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="relative bg-[#faf7f2] text-stone-900 pt-20 pb-10 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 pb-12 border-b border-stone-300/60">
          <div className="max-w-md">
            <Eyebrow className="text-stone-500">קולופון</Eyebrow>
            <p className="mt-5 text-stone-700 text-xl leading-snug font-semibold">
              &ldquo;הכי טוב ב-DM — התחושה שמישהו באמת הקשיב.&rdquo;
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-stone-600">
            <Link href="/admin" className="hover:text-stone-900 transition-colors">
              כניסה למערכת
            </Link>
            <a href="#contact" className="hover:text-stone-900 transition-colors">
              צרו קשר
            </a>
            <a href="#faq" className="hover:text-stone-900 transition-colors">
              שאלות
            </a>
          </div>
        </div>

        {/* Giant logo */}
        <div className="py-14 md:py-20 flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="BestieAI"
            width={2400}
            height={600}
            className="w-full max-w-5xl h-auto select-none"
            priority={false}
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-8 border-t border-stone-300/60 text-xs text-stone-500">
          <p>
            © {new Date().getFullYear()} BestieAI · All rights reserved
          </p>
          <p>
            נבנה ב-
            <a
              href="https://ldrsgroup.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-700 hover:text-stone-900 transition-colors underline underline-offset-2"
            >
              LDRS
            </a>
            {' '}· Tel Aviv
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Root page                                                          */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#faf7f2] text-stone-900 antialiased selection:bg-stone-900 selection:text-stone-50 overflow-x-hidden">
      <Grain />
      <Navbar />
      <Hero />
      <InteractiveDemo />
      <DMShowcase />
      <MomentOfRecognition />
      <Capabilities />
      <HowItWorks />
      <Faq />
      <CtaForm />
      <Footer />
    </main>
  );
}
