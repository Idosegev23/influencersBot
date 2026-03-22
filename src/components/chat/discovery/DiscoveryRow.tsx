'use client';

import { useRef } from 'react';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryRowProps {
  title: string;
  subtitle: string;
  color: string;
  items: DiscoveryItem[];
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
  slug: string;
  layout?: 'scroll' | 'hero' | 'grid';
}

function getThumb(item: DiscoveryItem) {
  return item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;
}

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug, layout = 'scroll' }: DiscoveryRowProps) {

  // === HERO layout ===
  if (layout === 'hero' && items.length >= 3) {
    const featured = items[0];
    const featuredThumb = getThumb(featured);
    const isReel = featured.mediaType === 'reel' || featured.mediaType === 'video';

    return (
      <section className="space-y-4" dir="rtl">
        <SectionHeader title={title} subtitle={subtitle} color={color} />
        <div className="space-y-[10px]">
          {/* Large 16:9 card */}
          <button
            onClick={() => onItemClick(featured, title, slug)}
            className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
            style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
          >
            {featuredThumb ? (
              <img src={featuredThumb} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }} />
            )}
            <div className="absolute inset-0 card-gradient" />
            <div className="absolute top-3 right-3 bg-[#b5116b] text-white text-[10px] font-bold px-3 py-1 rounded-full">
              {featured.metricLabel && featured.metricValue
                ? formatMetric(featured.metricValue, featured.metricLabel)
                : 'מומלץ'}
            </div>
            {isReel && <ReelBadge />}
            <div className="absolute bottom-4 right-4 left-4">
              <p className="text-white font-bold text-lg text-shadow-premium line-clamp-2 text-right">
                {featured.aiTitle || featured.captionExcerpt}
              </p>
            </div>
          </button>

          {/* 2-col mobile, 3-col desktop grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-[10px]">
            {items.slice(1, 4).map((item, idx) => (
              <CardCompact
                key={item.postId || item.shortcode || `${slug}-${idx + 1}`}
                item={item}
                color={color}
                onClick={() => onItemClick(item, title, slug)}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // === GRID layout: 2-col mobile, 3-col desktop ===
  if (layout === 'grid' && items.length >= 2) {
    return (
      <section className="space-y-4" dir="rtl">
        <SectionHeader title={title} subtitle={subtitle} color={color} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-[10px]">
          {items.slice(0, 6).map((item, idx) => (
            <CardCompact
              key={item.postId || item.shortcode || `${slug}-${idx}`}
              item={item}
              color={color}
              onClick={() => onItemClick(item, title, slug)}
            />
          ))}
        </div>
      </section>
    );
  }

  // === DEFAULT: horizontal scroll ===
  return (
    <section className="space-y-4" dir="rtl">
      <SectionHeader title={title} subtitle={subtitle} color={color} />
      <div className="relative -mx-5">
        <div className="flex overflow-x-auto hide-scrollbar gap-[10px] px-5 pb-2">
          {items.map((item, idx) => {
            const thumb = getThumb(item);
            const isReel = item.mediaType === 'reel' || item.mediaType === 'video';

            return (
              <button
                key={item.postId || item.shortcode || `${slug}-${idx}`}
                onClick={() => onItemClick(item, title, slug)}
                className="relative flex-shrink-0 w-[155px] h-[220px] sm:w-[190px] sm:h-[260px] rounded-2xl overflow-hidden active:scale-[0.96] transition-transform"
                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}>
                    <span className="text-2xl opacity-20">📷</span>
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
          })}
        </div>
      </div>
    </section>
  );
}

// ── Compact card (grid) ──
function CardCompact({
  item,
  color,
  onClick,
}: {
  item: DiscoveryItem;
  color: string;
  onClick: () => void;
}) {
  const thumb = getThumb(item);
  const isReel = item.mediaType === 'reel' || item.mediaType === 'video';

  return (
    <button
      onClick={onClick}
      className="relative h-[160px] sm:h-[190px] rounded-2xl overflow-hidden active:scale-[0.96] transition-transform"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      {thumb ? (
        <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }} />
      )}
      <div className="absolute inset-0 card-gradient" />
      {isReel && <ReelBadge />}
      <div className="absolute bottom-3 right-3 left-3">
        <p className="text-white font-bold text-sm text-shadow-premium line-clamp-2 text-right">
          {item.aiTitle || item.captionExcerpt}
        </p>
      </div>
    </button>
  );
}

// ── Section header — vertical color bar (Stitch style) ──
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
