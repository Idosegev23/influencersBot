'use client';

/* ==========================================================================
   BestieAI — Public Landing Page

   Rendered by BOTH public routes:
     /    → <LandingPage lang="he" />   (RTL)
     /en  → <LandingPage lang="en" />   (LTR)

   Every string comes from `@/lib/i18n/landing`; nothing user-visible is
   hardcoded here. Direction is derived from `lang` and threaded through as
   `dir` — the page used to hardcode dir="rtl" on a dozen containers, which is
   why the layout is written with logical properties (start/end, ps/pe, ss/se)
   rather than physical ones (left/right, pl/pr, tl/tr): those flip themselves.

   Brand-aligned: Bestie purple gradient (#883FE2 → #B497EF → #E6F7FF).
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
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Languages,
  Loader2,
  Send,
} from 'lucide-react';
import { Marquee } from '@/components/ui/marquee';
import MagicBento from '@/components/ui/magic-bento';
import { LEADS_ACCOUNT_ID } from '@/lib/leads';
import {
  getLandingStrings,
  landingDir,
  type LandingLang,
  type LandingStrings,
} from '@/lib/i18n/landing';
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

// Bestie brand tokens — sourced from Figma (Primary-purple) + logo gradient.
const INDIGO = '#883fe2'; // brand-primary (deep purple)
const PEACH = '#b497ef';  // brand-soft (lavender highlight from gradient)
const BRAND_RGB = '136, 63, 226'; // #883fe2 in r,g,b — for rgba()/glow stops

/* ------------------------------------------------------------------ */
/*  Direction helpers                                                  */
/* ------------------------------------------------------------------ */

/** Everything a section needs to lay itself out for the active language. */
type Dirs = {
  lang: LandingLang;
  dir: 'ltr' | 'rtl';
  rtl: boolean;
  /** "Forward" arrow — points left in RTL, right in LTR. */
  Forward: typeof ArrowLeft;
  /** Diagonal send arrow, same idea. */
  SendArrow: typeof ArrowUpLeft;
  /** Hover nudge for `Forward`, in the reading direction. */
  nudge: string;
  /** Hover nudge for `SendArrow`. */
  nudgeDiagonal: string;
  /** Transform origin for the animated nav underline. */
  underlineOrigin: string;
  /** The route the language switcher points at. */
  otherHref: string;
};

function dirsFor(lang: LandingLang): Dirs {
  const rtl = landingDir(lang) === 'rtl';
  return {
    lang,
    dir: rtl ? 'rtl' : 'ltr',
    rtl,
    Forward: rtl ? ArrowLeft : ArrowRight,
    SendArrow: rtl ? ArrowUpLeft : ArrowUpRight,
    nudge: rtl ? 'group-hover:-translate-x-1' : 'group-hover:translate-x-1',
    nudgeDiagonal: rtl
      ? 'group-hover:-translate-y-0.5 group-hover:-translate-x-0.5'
      : 'group-hover:-translate-y-0.5 group-hover:translate-x-0.5',
    underlineOrigin: rtl ? 'origin-right' : 'origin-left',
    otherHref: rtl ? '/en' : '/',
  };
}

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
      src="/brand/bestie-icon.svg"
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

function Navbar({ t, d }: { t: LandingStrings; d: Dirs }) {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const navBg = useTransform(scrollY, [0, 80], ['rgba(250, 247, 242, 0)', 'rgba(250, 247, 242, 0.85)']);
  const navBorder = useTransform(scrollY, [0, 80], ['rgba(28, 25, 23, 0)', 'rgba(28, 25, 23, 0.08)']);

  const { Forward } = d;

  return (
    <motion.nav
      style={{ backgroundColor: navBg, borderColor: navBorder }}
      className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl border-b"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-8 h-16" dir={d.dir}>
        <Link href="#hero" className="flex items-center shrink-0">
          <Image src="/brand/bestie-wordmark.svg" alt="BestieAI" width={180} height={45} priority className="h-7 md:h-8 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-9 text-sm text-stone-600">
          {t.nav.links.map((l) =>
            l.href.startsWith('/') ? (
              <Link key={l.href} href={l.href} className="hover:text-stone-900 transition-colors relative group">
                {l.label}
                <span className={`absolute -bottom-1 inset-x-0 h-px bg-stone-900 scale-x-0 group-hover:scale-x-100 transition-transform ${d.underlineOrigin}`} />
              </Link>
            ) : (
              <a key={l.href} href={l.href} className="hover:text-stone-900 transition-colors relative group">
                {l.label}
                <span className={`absolute -bottom-1 inset-x-0 h-px bg-stone-900 scale-x-0 group-hover:scale-x-100 transition-transform ${d.underlineOrigin}`} />
              </a>
            ),
          )}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <LanguageSwitch t={t} d={d} />
          <Link
            href="/admin"
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            {t.nav.login}
          </Link>
          <a
            href="#contact"
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-stone-900 text-stone-50 text-sm font-semibold
                       hover:bg-stone-800 transition-all"
          >
            {t.nav.cta}
            <Forward className={`w-3.5 h-3.5 transition-transform ${d.nudge}`} />
          </a>
        </div>

        <button
          aria-label={t.nav.menuLabel}
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
            <div className="px-5 py-5 space-y-4" dir={d.dir}>
              {t.nav.links.map((l) =>
                l.href.startsWith('/') ? (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-base text-stone-700">
                    {l.label}
                  </Link>
                ) : (
                  <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-base text-stone-700">
                    {l.label}
                  </a>
                ),
              )}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Link href="/admin" className="text-sm text-stone-600" onClick={() => setOpen(false)}>
                    {t.nav.login}
                  </Link>
                  <LanguageSwitch t={t} d={d} compact />
                </div>
                <a
                  href="#contact"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-stone-900 text-stone-50 text-xs font-semibold"
                >
                  {t.nav.ctaMobile}
                  <Forward className="w-3 h-3" />
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
/*  Language switch — a plain link, not a toggle                       */
/* ------------------------------------------------------------------ */

/**
 * Deliberately a <Link>, not the dashboard's <LanguageToggle/>: that one PATCHes
 * `accounts.language` and needs a signed-in account. Here the language IS the
 * route, so switching is navigation and nothing needs to be persisted.
 */
function LanguageSwitch({ t, d, compact = false }: { t: LandingStrings; d: Dirs; compact?: boolean }) {
  return (
    <Link
      href={d.otherHref}
      title={t.nav.switchTitle}
      aria-label={t.nav.switchTitle}
      hrefLang={d.rtl ? 'en' : 'he'}
      className={`inline-flex items-center gap-1.5 text-stone-600 hover:text-stone-900 transition-colors ${
        compact ? 'text-sm' : 'px-3 py-2 text-sm'
      }`}
    >
      <Languages className="w-4 h-4" />
      {t.nav.switchLabel}
    </Link>
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
        src="/brand/bestie-icon.svg"
        alt=""
        width={820}
        height={820}
        priority
        className="w-[170px] sm:w-[240px] md:w-[380px] lg:w-[520px] h-auto drop-shadow-[0_30px_60px_rgba(136,63,226,0.25)]"
      />
    </motion.div>
  );
}

function Hero({ t, d }: { t: LandingStrings; d: Dirs }) {
  const { Forward } = d;
  return (
    <section
      id="hero"
      className="relative min-h-[100svh] pt-28 md:pt-32 pb-16 overflow-hidden bg-[#faf7f2] text-stone-900"
    >
      {/* Atmospheric colour. Logical insets so the pair mirrors with the
          headline instead of staying pinned to fixed sides — `start` is the
          reading side, which keeps the Hebrew composition exactly as it was
          (top blob right, bottom blob left) and mirrors it cleanly for English. */}
      <div className="pointer-events-none absolute top-10 start-[-20%] w-[700px] h-[700px] rounded-full bg-[#b497ef]/40 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 end-[-15%] w-[600px] h-[600px] rounded-full bg-[#883fe2]/25 blur-[140px]" />

      <div className="relative max-w-7xl w-full mx-auto px-5 md:px-8 h-full">
        {/* Top row: headline on the reading side, mark opposite it */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-6 items-center pt-6 md:pt-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE }}
            className="lg:col-span-7 order-1 lg:order-1"
            dir={d.dir}
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
              <span className="text-xs text-stone-600">{t.hero.badge}</span>
            </motion.div>

            <h1
              className="mt-6 font-black tracking-[-0.04em] leading-[0.88] text-stone-900"
              style={{ fontSize: 'clamp(2.75rem, 9vw, 7.75rem)' }}
            >
              {t.hero.titleLead}
              <br />
              <span className="relative inline-block">
                <span className="relative z-10">{t.hero.titleHighlight}</span>
                <svg
                  className="absolute inset-x-0 w-full z-0"
                  /* Hebrew has no descenders, so the stroke can ride close to the
                     baseline. Latin does, and at these display sizes the same
                     offset cut through the bottom of "talks" and collided with
                     the line below. Both values are in em so they track the
                     clamped font size instead of drifting at one breakpoint. */
                  style={
                    d.rtl
                      ? { bottom: '-0.04em', height: '0.5em' }
                      : { bottom: '-0.17em', height: '0.34em' }
                  }
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
              {/* stone-400 on #faf7f2 is ~2.3:1 and read as disabled rather than
                  deliberate. stone-500 clears the 3:1 large-text threshold and
                  still recedes behind the two lines above it. */}
              <span className="text-stone-500">{t.hero.titleTail}</span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
              className="mt-8 text-lg md:text-xl text-stone-600 leading-[1.55] max-w-xl"
            >
              {t.hero.subtitle}
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
                           shadow-[0_10px_30px_-8px_rgba(136,63,226,0.5)] hover:shadow-[0_16px_40px_-8px_rgba(136,63,226,0.6)] transition-shadow"
              >
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ background: `linear-gradient(115deg, ${INDIGO} 0%, #a78bfa 45%, ${PEACH} 100%)` }}
                />
                <span className="absolute inset-[2px] rounded-full bg-[#faf7f2] group-hover:bg-white transition-colors" />
                <span className="relative">{t.hero.ctaPrimary}</span>
                <Forward className={`relative w-4 h-4 transition-transform ${d.nudge}`} />
              </a>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-stone-300 text-stone-700 text-sm font-medium
                           hover:border-stone-900 hover:text-stone-900 transition-all"
              >
                {t.hero.ctaSecondary}
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
            /* order-2 on mobile is the whole point: with the mark first, the
               mark plus the cookie bar filled the entire phone viewport and the
               headline, subtext and CTA all sat below the fold. Anyone arriving
               from a bio link saw a logo and a consent prompt. */
            className="lg:col-span-5 order-2 lg:order-2 flex justify-center lg:justify-end"
          >
            <MouseParallaxMark />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Interactive Demo — click a prompt, watch the bot type a reply      */
/* ------------------------------------------------------------------ */

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

function InteractiveDemo({ t, d }: { t: LandingStrings; d: Dirs }) {
  const entries = t.demo.entries;
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'typing' | 'done'>('idle');

  const entry = entries[selected];
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
      <div className="max-w-7xl mx-auto px-5 md:px-8 grid lg:grid-cols-12 gap-10 lg:gap-16 items-start" dir={d.dir}>
        <div className="lg:col-span-5 lg:sticky lg:top-28">
          <Eyebrow className="text-stone-500">{t.demo.eyebrow}</Eyebrow>
          <h2
            className="mt-5 font-black tracking-[-0.03em] leading-[0.92] text-stone-900"
            style={{ fontSize: 'clamp(2rem, 5.5vw, 4.5rem)' }}
          >
            {t.demo.titleLead}
            <br />
            <span
              style={{ color: INDIGO }}
            >
              {t.demo.titleHighlight}
            </span>
          </h2>

          <p className="mt-6 text-stone-600 leading-relaxed max-w-md">{t.demo.subtitle}</p>

          <div className="mt-8 space-y-2">
            {entries.map((item, i) => (
              <button
                key={item.q}
                onClick={() => run(i)}
                className={`w-full text-start p-4 rounded-2xl border transition-all flex items-start gap-3 ${
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
                  {item.tag}
                </span>
                <span className="text-sm leading-snug">{item.q}</span>
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
                <div className="flex items-center gap-2 mx-auto text-xs text-stone-500" dir="ltr">
                  <MiniMark size={14} />
                  <span>{t.demo.chromeLabel}</span>
                </div>
                <div className="w-10" />
              </div>

              {/* messages */}
              <div className="p-6 md:p-8 min-h-[380px] flex flex-col justify-end gap-3 text-sm" dir={d.dir}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`q-${selected}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex justify-start"
                  >
                    <div className="bg-stone-100 text-stone-800 rounded-2xl rounded-ss-sm px-4 py-2.5 max-w-[78%]">
                      {entry.q}
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="flex justify-end">
                  <div
                    className="relative rounded-2xl rounded-se-sm px-4 py-2.5 max-w-[78%] text-stone-900 min-h-[2.5rem]"
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
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </motion.div>
                    )}
                    {(phase === 'typing' || phase === 'done') && (
                      <span className="leading-relaxed">
                        {typed}
                        {phase === 'typing' && (
                          <span className="inline-block w-[2px] h-4 align-middle bg-stone-400 animate-pulse ms-0.5" />
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

            <p className="mt-4 text-xs text-stone-600 text-center flex items-center justify-center gap-2">
              <span className="w-4 h-px bg-stone-300" />
              {t.demo.disclaimer}
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

function DMBubble({ dm, d }: { dm: DM; d: Dirs }) {
  return (
    <div className="w-[320px] md:w-[380px] shrink-0 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-sm" dir={d.dir}>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[10px] tracking-wide font-medium">
          {dm.tag}
        </span>
      </div>
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-start">
          <div className="bg-stone-100 text-stone-700 rounded-2xl rounded-ss-sm px-3.5 py-2 max-w-[88%]">
            {dm.q}
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="rounded-2xl rounded-se-sm px-3.5 py-2 max-w-[88%] text-stone-800 border"
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

function DMShowcase({ t, d }: { t: LandingStrings; d: Dirs }) {
  return (
    <section className="relative bg-[#faf7f2] py-20 md:py-24 overflow-hidden border-y border-stone-200/60">
      <div className="max-w-7xl mx-auto px-5 md:px-8 mb-10" dir={d.dir}>
        <h2
          className="mt-4 font-black tracking-[-0.03em] leading-[0.95] text-stone-900 max-w-3xl"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
        >
          {t.dmShowcase.title}
        </h2>
      </div>

      <div className="space-y-5">
        <Marquee gap="1.25rem" duration={50} pauseOnHover className="[--gap:1.25rem]">
          {t.dmShowcase.rowOne.map((dm, i) => (
            <DMBubble key={`r1-${i}`} dm={dm} d={d} />
          ))}
        </Marquee>
        <Marquee gap="1.25rem" duration={60} reverse pauseOnHover className="[--gap:1.25rem]">
          {t.dmShowcase.rowTwo.map((dm, i) => (
            <DMBubble key={`r2-${i}`} dm={dm} d={d} />
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

function MomentOfRecognition({ t, d }: { t: LandingStrings; d: Dirs }) {
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
        dir={d.dir}
        className="pointer-events-none absolute top-10 start-4 md:start-10 flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase text-stone-500"
      >
        <MiniMark size={14} className="opacity-80" />
        BestieAI
      </motion.div>

      <div className="relative max-w-7xl mx-auto px-5 md:px-8" dir={d.dir}>

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
              {t.recognition.titleLead}
              <br />
              {t.recognition.titleTail}
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
            className="md:col-span-4 md:pt-8"
          >
            <div className="md:border-s md:border-stone-700 md:ps-6">
              <p className="text-lg leading-relaxed text-stone-300">{t.recognition.bodyOne}</p>
              <p className="mt-5 text-lg leading-relaxed text-stone-300">{t.recognition.bodyTwo}</p>
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
              backgroundImage: `linear-gradient(100deg, #e6f7ff, ${PEACH}, #c8bef6, ${INDIGO})`,
            }}
          >
            {t.recognition.punchline}
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

/* Visual identity per card, zipped with the localized copy by index. Keep this
   the same length and order as `capabilities.cards` in the catalog. */
const CARD_VISUALS = [
  { color: '#1a1a2e', icon: <MessageSquare className="w-5 h-5 text-white" /> },
  { color: '#1e1b2e', icon: <Code2 className="w-5 h-5 text-white" /> },
  { color: '#1a2a1e', icon: <FileText className="w-5 h-5 text-white" /> },
  { color: '#1a1a2e', icon: <LayoutDashboard className="w-5 h-5 text-white" /> },
  { color: '#2a1a2e', icon: <Instagram className="w-5 h-5 text-white" /> },
  { color: '#1a2e24', icon: <MessageCircle className="w-5 h-5 text-white" /> },
];

function Capabilities({ t, d }: { t: LandingStrings; d: Dirs }) {
  const cards = t.capabilities.cards.map((card, i) => ({
    ...card,
    ...CARD_VISUALS[i % CARD_VISUALS.length],
  }));

  return (
    <section id="capabilities" className="relative bg-[#faf7f2] py-28 md:py-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir={d.dir}>
        <div className="mb-14 md:mb-20 max-w-3xl">
          <div>
            <Eyebrow className="text-stone-500">{t.capabilities.eyebrow}</Eyebrow>
            <h2
              className="mt-5 font-black tracking-[-0.03em] leading-[0.9] text-stone-900"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 5.5rem)' }}
            >
              {t.capabilities.titleLead}
              <br />
              <span
                style={{ color: INDIGO }}
              >
                {t.capabilities.titleHighlight}
              </span>
            </h2>
          </div>
          <p className="mt-6 text-stone-600 leading-relaxed max-w-[58ch]">
            {t.capabilities.note}
          </p>
        </div>

        <MagicBento
          cards={cards}
          textAutoHide={false}
          enableStars={false}
          enableSpotlight={true}
          enableBorderGlow={true}
          enableTilt={false}
          enableMagnetism={false}
          clickEffect={false}
          spotlightRadius={260}
          particleCount={0}
          glowColor={BRAND_RGB}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How It Works                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks({ t, d }: { t: LandingStrings; d: Dirs }) {
  return (
    <section id="how" className="relative bg-white py-28 md:py-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir={d.dir}>
        <div className="mb-20 max-w-3xl">
          <h2
            className="mt-5 font-black tracking-[-0.03em] leading-[0.9] text-stone-900"
            style={{ fontSize: 'clamp(2.25rem, 6vw, 5.5rem)' }}
          >
            {t.howItWorks.titleLead}
            <br />
            <span
              style={{ color: INDIGO }}
            >
              {t.howItWorks.titleHighlight}
            </span>
          </h2>
        </div>

        <div className="relative">
          {/* Rail down the edge of the number column. `insetInlineStart` so it
              tracks the 8rem column on whichever side the language starts. */}
          <div
            className="hidden md:block absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-stone-300 to-transparent"
            style={{ insetInlineStart: 'calc(8rem - 1px)' }}
          />

          <div className="space-y-14 md:space-y-20">
            {t.howItWorks.steps.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.8, ease: EASE, delay: i * 0.1 }}
                className="grid md:grid-cols-[8rem_1fr] gap-6 md:gap-16 items-start"
              >
                <div className="relative">
                  <span
                    className="font-black tracking-[-0.05em] leading-none block text-stone-200"
                    style={{ fontSize: 'clamp(4rem, 9vw, 9rem)' }}
                  >
                    {/* Step numbers are digits, not copy — generated, never translated. */}
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="hidden md:block absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-4 ring-white"
                    style={{ background: INDIGO, insetInlineEnd: '-1px' }}
                  />
                </div>

                <div className="md:pt-6 max-w-2xl">
                  <h3 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight leading-tight">
                    {s.title}
                  </h3>
                  <p className="mt-4 text-lg text-stone-600 leading-relaxed">{s.body}</p>
                  <p className="mt-4 text-xs tracking-wide uppercase text-stone-600 flex items-center gap-2">
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

function Faq({ t, d }: { t: LandingStrings; d: Dirs }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-[#faf7f2] py-28 md:py-40">
      <div className="max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-12 gap-10 md:gap-20" dir={d.dir}>
        <div className="md:col-span-5 md:sticky md:top-32 md:self-start">
          <h2
            className="mt-5 font-black tracking-[-0.03em] leading-[0.9] text-stone-900"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 4.5rem)' }}
          >
            {t.faq.titleLead}
            <br />
            <span
              style={{ color: INDIGO }}
            >
              {t.faq.titleHighlight}
            </span>
          </h2>
          <p className="mt-6 text-sm text-stone-500 max-w-sm leading-relaxed">{t.faq.note}</p>
        </div>

        <div className="md:col-span-7">
          <div className="divide-y divide-stone-300/60 border-y border-stone-300/60">
            {t.faq.items.map((item, i) => {
              const isOpen = openIdx === i;
              return (
                <div key={item.q} className="group">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 py-6 md:py-7 text-start"
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

function CtaForm({ t, d }: { t: LandingStrings; d: Dirs }) {
  const { SendArrow } = d;
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    bizType: '',
    notes: '',
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setError(t.cta.errNameRequired);
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError(t.cta.errContactRequired);
      return;
    }
    setError('');
    setState('submitting');
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: LEADS_ACCOUNT_ID,
          // Localized on purpose: this is the only field on the brief row that
          // tells sales which language to answer in.
          serviceName: t.cta.serviceName,
          fullName: form.fullName.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          businessName: form.bizType || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t.cta.errSendFailed);
      }
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : t.cta.errUnexpected);
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

      <div className="relative max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-12 gap-12 md:gap-16" dir={d.dir}>
        <div className="md:col-span-5">
          <Eyebrow className="text-stone-400">{t.cta.eyebrow}</Eyebrow>
          <h2
            className="mt-6 font-black tracking-[-0.03em] leading-[0.9]"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 6rem)' }}
          >
            {t.cta.titleLead}
            <br />
            <span
              style={{ color: PEACH }}
            >
              {t.cta.titleHighlight}
            </span>
          </h2>

          <p className="mt-8 text-stone-400 leading-relaxed max-w-md">{t.cta.lead}</p>

          <div className="mt-10 flex items-center gap-3 text-xs tracking-wide text-stone-500">
            <MiniMark size={18} className="opacity-80" />
            {t.cta.responseTime}
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
                  {t.cta.successTitle}
                  <br />
                  <span className="text-stone-500">{t.cta.successSubtitle}</span>
                </h3>
                <p className="mt-6 text-stone-400 leading-relaxed">{t.cta.successBody}</p>
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
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">{t.cta.fullNameLabel}</label>
                    <input
                      type="text"
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className={inputCls}
                      placeholder={t.cta.fullNamePlaceholder}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">{t.cta.bizTypeLabel}</label>
                    <div className="relative">
                      <select
                        value={form.bizType}
                        onChange={(e) => setForm({ ...form, bizType: e.target.value })}
                        className={`${inputCls} appearance-none pe-6 cursor-pointer [&>option]:bg-stone-900 [&>option]:text-stone-50`}
                      >
                        <option value="">{t.cta.bizTypePlaceholder}</option>
                        {t.cta.bizTypeOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute end-0 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">{t.cta.emailLabel}</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputCls}
                      placeholder={t.cta.emailPlaceholder}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">{t.cta.phoneLabel}</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className={inputCls}
                      placeholder={t.cta.phonePlaceholder}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <label className="text-[10px] tracking-[0.25em] uppercase text-stone-500">
                    {t.cta.notesLabel}{' '}
                    <span className="text-stone-600 normal-case tracking-normal">{t.cta.notesOptional}</span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={`${inputCls} resize-none`}
                    placeholder={t.cta.notesPlaceholder}
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
                          {t.cta.submitting}
                        </>
                      ) : (
                        <>
                          {t.cta.submit}
                          <SendArrow className={`w-4 h-4 transition-transform ${d.nudgeDiagonal}`} />
                        </>
                      )}
                    </span>
                  </button>
                  <p className="text-xs text-stone-500">{t.cta.submitNote}</p>
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

function Footer({ t, d }: { t: LandingStrings; d: Dirs }) {
  return (
    <footer className="relative bg-[#faf7f2] text-stone-900 pt-20 pb-10 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 md:px-8" dir={d.dir}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 pb-12 border-b border-stone-300/60">
          <div className="max-w-md">
            <p className="mt-5 text-stone-700 text-xl leading-snug font-semibold">
              {t.footer.quote}
            </p>
          </div>

          <nav aria-label={t.footer.navLabel} className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-stone-600">
            {t.footer.links.map((l) =>
              l.href.startsWith('/') ? (
                <Link key={l.href} href={l.href} className="hover:text-stone-900 transition-colors">
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href} className="hover:text-stone-900 transition-colors">
                  {l.label}
                </a>
              ),
            )}
            <LanguageSwitch t={t} d={d} compact />
          </nav>
        </div>

        {/* Giant logo */}
        <div className="py-14 md:py-20 flex items-center justify-center">
          <Image
            src="/brand/bestie-wordmark.svg"
            alt="BestieAI"
            width={2400}
            height={600}
            className="w-full max-w-5xl h-auto select-none"
            priority={false}
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-8 border-t border-stone-300/60 text-xs text-stone-500">
          <p>
            © {new Date().getFullYear()} BestieAI · {t.footer.rights}
          </p>
          <p>
            {t.footer.builtBy}
            <a
              href="https://ldrsgroup.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-700 hover:text-stone-900 transition-colors underline underline-offset-2"
            >
              LDRS
            </a>
            {' '}· {t.footer.city}
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage({ lang }: { lang: LandingLang }) {
  const t = getLandingStrings(lang);
  const d = dirsFor(lang);

  return (
    <main
      dir={d.dir}
      lang={lang}
      className="min-h-screen bg-[#faf7f2] text-stone-900 antialiased selection:bg-stone-900 selection:text-stone-50 overflow-x-hidden"
    >
      <Grain />
      <Navbar t={t} d={d} />
      <Hero t={t} d={d} />
      <InteractiveDemo t={t} d={d} />
      <DMShowcase t={t} d={d} />
      <MomentOfRecognition t={t} d={d} />
      <Capabilities t={t} d={d} />
      <HowItWorks t={t} d={d} />
      <Faq t={t} d={d} />
      <CtaForm t={t} d={d} />
      <Footer t={t} d={d} />
    </main>
  );
}
