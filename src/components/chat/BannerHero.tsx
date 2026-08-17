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

import { motion } from 'framer-motion';
import type { ResolvedBanner } from '@/lib/widget/banner';

const BANNER_H_DESKTOP = 206;
const BANNER_H_MOBILE = 168;
const BANNER_COLLAPSED_H = 44;

function artStyle(art: ResolvedBanner['art']): React.CSSProperties {
  if (art.mode === 'image' && art.image) {
    return {
      // Scrim over the photo, not under it — white 25px copy on an unmeasured
      // image is a coin flip otherwise.
      backgroundImage:
        `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.72) 100%), url("${art.image}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: art.to,
    };
  }
  return { backgroundImage: `linear-gradient(135deg, ${art.from}, ${art.to})`, backgroundColor: art.to };
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
  if (collapsed) {
    return (
      <div
        dir={dir}
        style={{ ...artStyle(banner.art), height: BANNER_COLLAPSED_H }}
        className="flex items-center gap-2 overflow-hidden rounded-xl px-4"
      >
        {banner.eyebrow && (
          <span
            className="flex-shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide text-white"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          >
            {banner.eyebrow}
          </span>
        )}
        <span
          className="min-w-0 truncate text-[12.5px] font-semibold"
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
      style={{ ...artStyle(banner.art), minHeight: isMobile ? BANNER_H_MOBILE : BANNER_H_DESKTOP }}
      className="relative flex w-full flex-col justify-end overflow-hidden rounded-2xl"
    >
      {/* min-height, not height: a headline that wraps to three lines on a
          390px phone would otherwise be clipped from the top. Copy is pinned
          to the block end but the box grows to fit it. */}
      <div
        className={`flex flex-col items-start text-start ${
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
