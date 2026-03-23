'use client';

import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryRowProps {
  title: string;
  subtitle: string;
  color: string;
  items: DiscoveryItem[];
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
  slug: string;
  layout: 'masonry' | 'scroll';
}

function getThumb(item: DiscoveryItem) {
  return item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;
}

/**
 * Masonry interleave pattern per column position:
 *   Right col: tall → short → tall
 *   Left col:  short → tall → short
 * Cards mesh like puzzle pieces — no dead white space.
 */
const RIGHT_PATTERN: Array<'tall' | 'short'> = ['tall', 'short', 'tall'];
const LEFT_PATTERN: Array<'tall' | 'short'> = ['short', 'tall', 'short'];

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug, layout }: DiscoveryRowProps) {
  if (layout === 'scroll') {
    return (
      <section className="space-y-3" dir="rtl">
        <div className="px-5">
          <SectionHeader title={title} subtitle={subtitle} color={color} />
        </div>
        <HorizontalScroll
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
  const rightCol: DiscoveryItem[] = [];
  const leftCol: DiscoveryItem[] = [];
  capped.forEach((item, i) => {
    if (i % 2 === 0) rightCol.push(item);
    else leftCol.push(item);
  });

  return (
    <section className="space-y-3" dir="rtl">
      <SectionHeader title={title} subtitle={subtitle} color={color} />
      <div className="flex gap-[10px]">
        {/* Right column (first in RTL) */}
        <div className="flex-1 flex flex-col gap-[10px]">
          {rightCol.map((item, pos) => {
            const aspect = RIGHT_PATTERN[pos % RIGHT_PATTERN.length] === 'tall'
              ? 'aspect-[9/16]' : 'aspect-[4/5]';
            return (
              <PinCard
                key={item.postId || item.shortcode || `${slug}-r${pos}`}
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
          {leftCol.map((item, pos) => {
            const aspect = LEFT_PATTERN[pos % LEFT_PATTERN.length] === 'tall'
              ? 'aspect-[9/16]' : 'aspect-[4/5]';
            return (
              <PinCard
                key={item.postId || item.shortcode || `${slug}-l${pos}`}
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

// ── Manual swipeable horizontal scroll (mobile-friendly) ──
function HorizontalScroll({
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
  return (
    <div className="relative -mx-5">
      <div
        className="flex overflow-x-auto hide-scrollbar gap-[10px] px-5 pb-2 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item, idx) => {
          const thumb = getThumb(item);
          const isReel = item.mediaType === 'reel' || item.mediaType === 'video';

          return (
            <button
              key={`${item.postId || item.shortcode || slug}-scroll-${idx}`}
              onClick={() => onItemClick(item, title, slug)}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden active:scale-[0.97] transition-transform snap-start"
              style={{
                width: '150px',
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
