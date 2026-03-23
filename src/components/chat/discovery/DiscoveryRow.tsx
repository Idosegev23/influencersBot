'use client';

import { useRef, useState } from 'react';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryRowProps {
  title: string;
  subtitle: string;
  color: string;
  items: DiscoveryItem[];
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
  slug: string;
  layout: 'masonry' | 'marquee';
}

function getThumb(item: DiscoveryItem) {
  return item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;
}

/**
 * Interleaving pattern for masonry — alternates tall/short across 2 columns
 * so that the columns mesh together with no dead white space.
 *
 * Pattern (indexes): col-right [0,3,4] col-left [1,2,5]
 * Aspect:            col-right: 9:16, 4:5, 9:16  |  col-left: 4:5, 9:16, 4:5
 *
 * Height sum per col (relative):
 *   right: 1.778 + 1.25 + 1.778 = 4.806
 *   left:  1.25 + 1.778 + 1.25  = 4.278
 * Close enough — the slight offset creates a natural Pinterest stagger.
 */
const MASONRY_PATTERN: Array<'tall' | 'short'> = [
  'tall', 'short', 'tall',   // right column
  'short', 'tall', 'short',  // left column
];

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug, layout }: DiscoveryRowProps) {
  if (layout === 'marquee') {
    return (
      <section className="space-y-3" dir="rtl">
        <div className="px-5">
          <SectionHeader title={title} subtitle={subtitle} color={color} />
        </div>
        <MarqueeScroll
          items={items.slice(0, 12)}
          color={color}
          slug={slug}
          title={title}
          onItemClick={onItemClick}
        />
      </section>
    );
  }

  // === MASONRY layout ===
  const capped = items.slice(0, 6);
  // Split into 2 columns: even indices → right, odd → left (RTL)
  const rightCol: { item: DiscoveryItem; idx: number }[] = [];
  const leftCol: { item: DiscoveryItem; idx: number }[] = [];
  capped.forEach((item, i) => {
    if (i % 2 === 0) rightCol.push({ item, idx: i });
    else leftCol.push({ item, idx: i });
  });

  return (
    <section className="space-y-3" dir="rtl">
      <SectionHeader title={title} subtitle={subtitle} color={color} />
      <div className="flex gap-[10px]">
        {/* Right column (first in RTL) */}
        <div className="flex-1 flex flex-col gap-[10px]">
          {rightCol.map(({ item, idx }) => {
            const patternIdx = idx < MASONRY_PATTERN.length ? idx : idx % MASONRY_PATTERN.length;
            const aspect = MASONRY_PATTERN[patternIdx] === 'tall' ? 'aspect-[9/16]' : 'aspect-[4/5]';
            return (
              <PinCard
                key={item.postId || item.shortcode || `${slug}-${idx}`}
                item={item}
                color={color}
                aspect={aspect}
                onClick={() => onItemClick(item, title, slug)}
              />
            );
          })}
        </div>
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-[10px]">
          {leftCol.map(({ item, idx }) => {
            const patternIdx = idx < MASONRY_PATTERN.length ? idx : idx % MASONRY_PATTERN.length;
            const aspect = MASONRY_PATTERN[patternIdx] === 'tall' ? 'aspect-[9/16]' : 'aspect-[4/5]';
            return (
              <PinCard
                key={item.postId || item.shortcode || `${slug}-${idx}`}
                item={item}
                color={color}
                aspect={aspect}
                onClick={() => onItemClick(item, title, slug)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Infinite marquee horizontal scroll ──
function MarqueeScroll({
  items,
  color,
  slug,
  title,
  onItemClick,
}: {
  items: DiscoveryItem[];
  color: string;
  slug: string;
  title: string;
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // Calculate total width for animation
  const cardW = 150; // px per card
  const gap = 10;
  const totalW = items.length * (cardW + gap);

  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div
      className="relative overflow-hidden -mx-5"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex gap-[10px] px-5 will-change-transform"
        style={{
          animation: `marquee-scroll ${items.length * 3}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
          width: `${totalW * 2 + gap}px`,
        }}
      >
        {doubled.map((item, idx) => {
          const thumb = getThumb(item);
          const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
          return (
            <button
              key={`${item.postId || item.shortcode || slug}-marquee-${idx}`}
              onClick={() => onItemClick(item, title, slug)}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden active:scale-[0.97] transition-transform"
              style={{
                width: `${cardW}px`,
                aspectRatio: '4/5',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
            >
              {thumb ? (
                <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}>
                  <span className="text-2xl opacity-20">&#x1f4f7;</span>
                </div>
              )}
              <div className="absolute inset-0 card-gradient" />

              {item.rank && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-[10px] font-bold" style={{ color: '#191c1e' }}>
                  #{item.rank}
                </div>
              )}

              {isReel && <ReelBadge />}

              <div className="absolute bottom-2 right-2 left-2">
                {item.metricValue != null && item.metricLabel && (
                  <span className="inline-block bg-white/15 backdrop-blur-md text-white text-[8px] font-semibold px-1.5 py-0.5 rounded-full mb-0.5">
                    {formatMetric(item.metricValue, item.metricLabel)}
                  </span>
                )}
                <p className="text-white font-bold text-[11px] text-shadow-premium line-clamp-2 text-right">
                  {item.aiTitle || item.captionExcerpt}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* CSS keyframes for the marquee */}
      <style jsx>{`
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-${totalW}px); }
        }
      `}</style>
    </div>
  );
}

// ── Pinterest-style pin card ──
function PinCard({
  item,
  color,
  aspect,
  onClick,
}: {
  item: DiscoveryItem;
  color: string;
  aspect: string;
  onClick: () => void;
}) {
  const thumb = getThumb(item);
  const isReel = item.mediaType === 'reel' || item.mediaType === 'video';

  return (
    <button
      onClick={onClick}
      className={`relative w-full ${aspect} rounded-2xl overflow-hidden active:scale-[0.97] transition-transform`}
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      {thumb ? (
        <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}>
          <span className="text-2xl opacity-20">&#x1f4f7;</span>
        </div>
      )}
      <div className="absolute inset-0 card-gradient" />

      {item.rank && (
        <div className="absolute top-3 right-3 w-7 h-7 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-[12px] font-bold" style={{ color: '#191c1e' }}>
          #{item.rank}
        </div>
      )}

      {isReel && <ReelBadge />}

      <div className="absolute bottom-3 right-3 left-3">
        {item.metricValue != null && item.metricLabel && (
          <span className="inline-block bg-white/15 backdrop-blur-md text-white text-[9px] font-semibold px-2 py-0.5 rounded-full mb-1">
            {formatMetric(item.metricValue, item.metricLabel)}
          </span>
        )}
        <p className="text-white font-bold text-[12px] sm:text-[13px] text-shadow-premium line-clamp-2 text-right">
          {item.aiTitle || item.captionExcerpt}
        </p>
      </div>
    </button>
  );
}

// ── Section header — vertical color bar ──
function SectionHeader({ title, subtitle, color }: { title: string; subtitle: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <div>
        <h2 className="font-bold text-lg leading-none" style={{ color: '#191c1e' }}>{title}</h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: '#444749' }}>{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Helpers ──
function ReelBadge() {
  return (
    <div className="absolute top-3 left-3 w-6 h-6 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
      <span className="material-symbols-outlined text-white text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
    </div>
  );
}

function formatMetric(value: number | undefined, label: string | undefined): string {
  if (value == null || !label) return '';
  if (label === '% מעורבות') return `${value}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('he-IL');
}
