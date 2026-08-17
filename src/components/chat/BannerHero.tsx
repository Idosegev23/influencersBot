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
const VIDEO_H_DESKTOP = 300;
const VIDEO_H_MOBILE = 250;
const BANNER_COLLAPSED_H = 44;

/** How far the copy climbs into the dissolved tail of the reel. */
const MERGE_OVERLAP_DESKTOP = 64;
const MERGE_OVERLAP_MOBILE = 54;

/**
 * The dissolve. Two masks composited: the reel fades out downward into the page
 * so there is no cut line where the video stops, and a gentle horizontal
 * vignette softens the vertical edges so the plate reads as light rather than
 * as a rectangle. The copy then sits inside the faded tail — that overlap is
 * what makes the two halves one object instead of a video with a caption box.
 */
const REEL_MASK = [
  'linear-gradient(to bottom, #000 0%, #000 46%, rgba(0,0,0,0.72) 66%, rgba(0,0,0,0.28) 84%, transparent 100%)',
  'linear-gradient(to right, transparent 0%, #000 7%, #000 93%, transparent 100%)',
].join(', ');

const EASE_SOFT = [0.32, 0.72, 0, 1] as const;

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

  const ctaSkin = onDark
    ? { background: '#fff', color: '#111' }
    : { background: banner.art.from, color: '#fff', boxShadow: `0 10px 30px -12px ${banner.art.from}` };

  const copy = (
    <div
      className={
        reel
          ? // Centered under a full-width dissolve: an inset-start column would
            // hang off the reel's soft edge with nothing to align to.
            `flex flex-col items-center text-center ${isMobile ? 'px-5' : 'px-8'}`
          : `relative z-10 flex flex-col items-start text-start ${
              isMobile ? 'px-4 pb-[22px] pt-[26px]' : 'px-5 pb-[26px] pt-[30px]'
            }`
      }
    >
      {banner.eyebrow && (
        <div
          className="mb-2.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase"
          style={{
            letterSpacing: '0.18em',
            color: onDark ? 'rgba(255,255,255,0.85)' : banner.art.from,
            // Opaque, not a tint: this pill is the first thing under the
            // dissolve, so whatever is left of the reel shows through anything
            // translucent and the label stops being readable.
            background: onDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.92)',
            boxShadow: onDark ? undefined : '0 2px 14px rgba(12,16,19,0.10)',
          }}
        >
          {banner.eyebrow}
        </div>
      )}
      <div
        className="font-extrabold"
        style={{
          fontSize: isMobile ? '23px' : '28px',
          lineHeight: 1.16,
          letterSpacing: '-0.015em',
          color: onDark ? '#fff' : '#0c1013',
          textShadow: onDark ? '0 1px 12px rgba(0,0,0,0.25)' : undefined,
          maxWidth: reel ? '19ch' : undefined,
        }}
      >
        {banner.headline}
      </div>
      {banner.subline && (
        <div
          className="mt-2 text-[13.5px] font-normal leading-[1.5]"
          style={{
            color: onDark ? 'rgba(255,255,255,0.78)' : '#6b6b6b',
            maxWidth: reel ? '38ch' : undefined,
          }}
        >
          {banner.subline}
        </div>
      )}
      {banner.cta &&
        (banner.cta.action === 'none' ? (
          <span
            className="mt-4 inline-flex items-center gap-2 rounded-full py-2 ps-5 pe-2 text-[13.5px] font-semibold opacity-90"
            style={ctaSkin}
          >
            {banner.cta.label}
          </span>
        ) : (
          <button
            type="button"
            onClick={onCtaClick}
            className="group mt-4 inline-flex items-center gap-2 rounded-full py-2 ps-5 pe-2 text-[13.5px] font-semibold
                       transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97]"
            style={ctaSkin}
          >
            {banner.cta.label}
            {/* The arrow lives in its own well rather than floating beside the
                label, and drifts on hover so the button has internal tension. */}
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-full transition-transform
                         duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105 group-hover:-translate-y-px"
              style={{ background: onDark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.22)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={dir === 'rtl' ? 'M19 12H5M12 19l-7-7 7-7' : 'M5 12h14M12 5l7 7-7 7'} />
              </svg>
            </span>
          </button>
        ))}
    </div>
  );

  // Video composition. No card, no border, no cut line: the reel dissolves
  // into the page through a mask and the copy climbs into that dissolve, so
  // the two read as one object. The earlier version stacked a video box on a
  // white caption box, which is why it looked like two containers glued
  // together rather than a designed thing.
  if (reel) {
    const overlap = isMobile ? MERGE_OVERLAP_MOBILE : MERGE_OVERLAP_DESKTOP;
    return (
      <motion.div
        initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: EASE_SOFT }}
        dir={dir}
        className="relative w-full"
      >
        {/* Ambient haze in the brand hue, sitting under the dissolve so the
            reel fades into warm light instead of onto flat page white. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10"
          style={{
            height: '78%',
            background: `radial-gradient(58% 62% at 50% 42%, ${banner.art.from}, transparent 72%)`,
            filter: 'blur(46px)',
            opacity: 0.34,
          }}
        />

        <div
          className="relative w-full overflow-hidden"
          style={{
            height: isMobile ? VIDEO_H_MOBILE : VIDEO_H_DESKTOP,
            borderRadius: isMobile ? 24 : 30,
            WebkitMaskImage: REEL_MASK,
            maskImage: REEL_MASK,
            WebkitMaskComposite: 'source-in',
            maskComposite: 'intersect',
          }}
        >
          <ReelLayer reel={reel} playing />
        </div>

        <div style={{ marginTop: -overlap }}>{copy}</div>
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
