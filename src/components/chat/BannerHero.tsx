'use client';

/**
 * Opening banner for /chat/[username].
 *
 * The chat page already owned this copy — `greeting_message` was the headline
 * and `chat_subtitle` the subline, both rendered as bare centered text. This
 * component gives that block a surface (art, eyebrow, CTA) instead of stacking
 * a second marketing message on top of it, so nothing is said twice and the
 * ChatInput stays above the fold on mobile.
 *
 * Sibling renderer: `bannerHtml()` in public/widget.js. Both consume the shape
 * returned by resolveBanner(); keep the two visually in step.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { BannerReel, ResolvedBanner } from '@/lib/widget/banner';

const BANNER_H_DESKTOP = 206;
const BANNER_H_MOBILE = 168;
// The reel's own band, with the copy below rather than on top. Reels are shot
// 9:16, so any horizontal frame crops hard; ~1.9:1 keeps a top-down dish or a
// pan legible while staying a band rather than a video player.
const VIDEO_H_DESKTOP = 260;
const VIDEO_H_MOBILE = 220;
const BANNER_COLLAPSED_H = 44;

/** The scrim that keeps white copy legible over unmeasured artwork. */
const SCRIM = 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.72) 100%)';
// Heavier for video: reels carry burned-in captions of their own, and our
// headline has to win against whatever text drifts through the frame.
const SCRIM_VIDEO = 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.30) 38%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.86) 100%)';

function artStyle(art: ResolvedBanner['art']): React.CSSProperties {
  if (art.mode === 'video') {
    // The gradient paints the box until the first frame decodes — a black
    // rectangle for half a second reads as broken.
    return { backgroundImage: `linear-gradient(135deg, ${art.from}, ${art.to})`, backgroundColor: art.to };
  }
  if (art.mode === 'image' && art.image) {
    return {
      // Scrim over the photo, not under it — white 25px copy on an unmeasured
      // image is a coin flip otherwise.
      backgroundImage: `${SCRIM}, url("${art.image}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: art.to,
    };
  }
  return { backgroundImage: `linear-gradient(135deg, ${art.from}, ${art.to})`, backgroundColor: art.to };
}

/**
 * Autoplaying reel behind the banner copy.
 *
 * Muted, looping, inline — the only combination browsers will autoplay without
 * a gesture. Three things deliberately suppress it: `prefers-reduced-motion`,
 * the Save-Data header, and the collapsed strip. In each case the poster frame
 * stands in, so the banner still looks intentional rather than empty.
 */
function ReelLayer({ reel, playing, scrim }: { reel: BannerReel; playing: boolean; scrim?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [allowMotion, setAllowMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Don't spend a visitor's metered connection on decoration.
    const saveData = (navigator as any)?.connection?.saveData === true;
    setAllowMotion(!reduced && !saveData);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing && allowMotion) {
      // Autoplay can still be refused (low power mode); the poster remains.
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [playing, allowMotion]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {allowMotion ? (
        <video
          ref={videoRef}
          src={reel.video}
          poster={reel.poster || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          className="h-full w-full object-cover"
        />
      ) : (
        reel.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reel.poster} alt="" aria-hidden className="h-full w-full object-cover" />
        )
      )}
      {scrim && <div className="absolute inset-0" style={{ backgroundImage: scrim }} />}
    </div>
  );
}

export interface BannerHeroProps {
  banner: ResolvedBanner;
  isMobile: boolean;
  /** true once the visitor has sent a message — collapses to a 44px strip. */
  collapsed: boolean;
  dir: 'rtl' | 'ltr';
  onCtaClick: () => void;
}

export function BannerHero({ banner, isMobile, collapsed, dir, onCtaClick }: BannerHeroProps) {
  // Pick the reel once per mount. Rotating on every render would restart the
  // video on each keystroke; rotating per visit is the point.
  const reels = banner.art.reels;
  const [reelIndex] = useState(() => (reels?.length ? Math.floor(Math.random() * reels.length) : 0));
  const reel = useMemo(() => (reels?.length ? reels[reelIndex] ?? reels[0] : null), [reels, reelIndex]);

  if (collapsed) {
    return (
      <div
        dir={dir}
        style={{ ...artStyle(banner.art), height: BANNER_COLLAPSED_H }}
        className="relative flex items-center gap-2 overflow-hidden rounded-xl px-4"
      >
        {/* Paused: a video playing above a live conversation is a distraction
            and a battery cost, so the strip keeps only the poster frame. */}
        {reel && <ReelLayer reel={reel} playing={false} scrim={SCRIM_VIDEO} />}
        {banner.eyebrow && (
          <span
            className="relative z-10 flex-shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide text-white"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          >
            {banner.eyebrow}
          </span>
        )}
        <span
          className="relative z-10 min-w-0 truncate text-[12.5px] font-semibold"
          style={{ color: banner.eyebrow ? 'rgba(255,255,255,0.78)' : '#fff' }}
        >
          {banner.headline}
        </span>
      </div>
    );
  }

  const onDark = !reel; // gradient/image keep white copy over the art

  const copy = (
    <div
      className={
        reel
          ? `flex flex-col items-start text-start ${isMobile ? 'px-4 py-4' : 'px-5 py-[18px]'}`
          : `relative z-10 flex flex-col items-start text-start ${
              isMobile ? 'px-4 pb-[22px] pt-[26px]' : 'px-5 pb-[26px] pt-[30px]'
            }`
      }
    >
      {banner.eyebrow && (
        <div
          className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide"
          style={{ color: onDark ? 'rgba(255,255,255,0.78)' : 'var(--color-primary, #ff6b35)' }}
        >
          {banner.eyebrow}
        </div>
      )}
      <div
        className="font-extrabold"
        style={{
          fontSize: isMobile ? '20px' : '23px',
          lineHeight: 1.2,
          color: onDark ? '#fff' : '#0c1013',
          textShadow: onDark ? '0 1px 12px rgba(0,0,0,0.25)' : undefined,
        }}
      >
        {banner.headline}
      </div>
      {banner.subline && (
        <div
          className="mt-[6px] text-[13.5px] font-normal leading-[1.45]"
          style={{ color: onDark ? 'rgba(255,255,255,0.78)' : '#676767' }}
        >
          {banner.subline}
        </div>
      )}
      {banner.cta &&
        (banner.cta.action === 'none' ? (
          <span
            className="mt-3 inline-flex items-center rounded-full px-4 py-2 text-[13px] font-semibold opacity-90"
            style={onDark ? { background: '#fff', color: '#111' } : { background: 'var(--color-primary, #ff6b35)', color: '#fff' }}
          >
            {banner.cta.label}
          </span>
        ) : (
          <button
            type="button"
            onClick={onCtaClick}
            className="mt-3 inline-flex items-center rounded-full px-4 py-2 text-[13px] font-semibold transition-transform active:scale-[0.98]"
            style={onDark ? { background: '#fff', color: '#111' } : { background: 'var(--color-primary, #ff6b35)', color: '#fff' }}
          >
            {banner.cta.label}
          </button>
        ))}
    </div>
  );

  // Video gets its own composition: the reel on top, copy on a clean surface
  // beneath it. Laying text over a recipe reel meant a heavy scrim, and a
  // scrim over food is just mud — the one thing the visitor should see is the
  // thing we were darkening. Separating them also means no crop compromise on
  // the copy side and no text fighting the reel's burned-in captions.
  if (reel) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        dir={dir}
        className="w-full overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: '0 6px 28px rgba(12,16,19,0.08)' }}
      >
        <div className="relative w-full" style={{ height: isMobile ? VIDEO_H_MOBILE : VIDEO_H_DESKTOP }}>
          <ReelLayer reel={reel} playing />
        </div>
        {copy}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      dir={dir}
      style={{ ...artStyle(banner.art), minHeight: isMobile ? BANNER_H_MOBILE : BANNER_H_DESKTOP }}
      className="relative flex w-full flex-col justify-end overflow-hidden rounded-2xl"
    >
      {/* min-height, not height: a headline that wraps to three lines on a
          390px phone would otherwise be clipped from the top. Copy is pinned
          to the block end but the box grows to fit it. */}
      {copy}
    </motion.div>
  );
}
