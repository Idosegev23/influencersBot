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
// Reels are shot 9:16. At the flat banner height a vertical frame cropped to
// 3.25:1 shows barely a tenth of the picture — in practice an arbitrary slice
// of someone's forehead. Video mode gets a taller box so the crop keeps a
// recognisable subject, at the cost of some panel height.
const VIDEO_H_DESKTOP = 300;
const VIDEO_H_MOBILE = 280;
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
function ReelLayer({ reel, playing }: { reel: BannerReel; playing: boolean }) {
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
      <div className="absolute inset-0" style={{ backgroundImage: SCRIM_VIDEO }} />
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
        {reel && <ReelLayer reel={reel} playing={false} />}
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      dir={dir}
      style={{
        ...artStyle(banner.art),
        minHeight: reel
          ? (isMobile ? VIDEO_H_MOBILE : VIDEO_H_DESKTOP)
          : (isMobile ? BANNER_H_MOBILE : BANNER_H_DESKTOP),
      }}
      className="relative flex w-full flex-col justify-end overflow-hidden rounded-2xl"
    >
      {reel && <ReelLayer reel={reel} playing />}
      {/* min-height, not height: a headline that wraps to three lines on a
          390px phone would otherwise be clipped from the top. Copy is pinned
          to the block end but the box grows to fit it. */}
      <div
        className={`relative z-10 flex flex-col items-start text-start ${
          isMobile ? 'px-4 pb-[22px] pt-[26px]' : 'px-5 pb-[26px] pt-[30px]'
        }`}
      >
        {banner.eyebrow && (
          <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.78)' }}>
            {banner.eyebrow}
          </div>
        )}
        <div
          className="font-extrabold text-white"
          style={{
            fontSize: isMobile ? '22px' : '25px',
            lineHeight: 1.18,
            textShadow: '0 1px 12px rgba(0,0,0,0.25)',
          }}
        >
          {banner.headline}
        </div>
        {banner.subline && (
          <div className="mt-[7px] text-[13.5px] font-normal leading-[1.45]" style={{ color: 'rgba(255,255,255,0.78)' }}>
            {banner.subline}
          </div>
        )}
        {banner.cta &&
          (banner.cta.action === 'none' ? (
            <span className="mt-3 inline-flex items-center rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#111] opacity-90">
              {banner.cta.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={onCtaClick}
              className="mt-3 inline-flex items-center rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#111] transition-transform active:scale-[0.98]"
            >
              {banner.cta.label}
            </button>
          ))}
      </div>
    </motion.div>
  );
}
