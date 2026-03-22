'use client';

import { useRef, useState, useEffect } from 'react';
import { DiscoveryCard } from './DiscoveryCard';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryRowProps {
  title: string;
  subtitle: string;
  color: string;
  items: DiscoveryItem[];
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
  slug: string;
  /** Layout variant for visual diversity */
  layout?: 'scroll' | 'hero' | 'grid';
}

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug, layout = 'scroll' }: DiscoveryRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const sl = Math.abs(el.scrollLeft);
    setCanScrollRight(sl > 10);
    setCanScrollLeft(sl + el.clientWidth < el.scrollWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    return () => el?.removeEventListener('scroll', checkScroll);
  }, [items]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = dir === 'left' ? 200 : -200;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // === HERO layout: big featured card + stacked smaller cards ===
  if (layout === 'hero' && items.length > 0) {
    return (
      <section className="mb-8 px-4" dir="rtl">
        <SectionHeader title={title} subtitle={subtitle} />
        <div className="flex gap-3">
          <DiscoveryCard
            item={items[0]}
            color={color}
            onClick={(it) => onItemClick(it, title, slug)}
            variant="hero"
          />
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            {items.slice(1, 3).map((item, idx) => (
              <DiscoveryCard
                key={item.postId || item.shortcode || `${slug}-${idx + 1}`}
                item={item}
                color={color}
                onClick={(it) => onItemClick(it, title, slug)}
                variant="wide"
              />
            ))}
          </div>
        </div>
        {items.length > 3 && (
          <div className="flex gap-3 mt-3 overflow-x-auto no-scrollbar pb-2">
            {items.slice(3).map((item, idx) => (
              <DiscoveryCard
                key={item.postId || item.shortcode || `${slug}-${idx + 3}`}
                item={item}
                color={color}
                onClick={(it) => onItemClick(it, title, slug)}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  // === GRID layout: 3-column compact grid ===
  if (layout === 'grid') {
    return (
      <section className="mb-8 px-4" dir="rtl">
        <SectionHeader title={title} subtitle={subtitle} />
        <div className="grid grid-cols-3 gap-2.5">
          {items.map((item, idx) => {
            const thumbnailSrc = item.thumbnailUrl
              ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
              : item.shortcode
                ? getProxiedImageByShortcode(item.shortcode)
                : null;
            const isReel = item.mediaType === 'reel' || item.mediaType === 'video';

            return (
              <button
                key={item.postId || item.shortcode || `${slug}-${idx}`}
                onClick={() => onItemClick(item, title, slug)}
                className="relative aspect-square overflow-hidden rounded-xl group active:scale-[0.96] transition-transform"
                style={{ boxShadow: '0 4px 12px rgba(12, 16, 19, 0.06)' }}
              >
                {thumbnailSrc ? (
                  <img
                    src={thumbnailSrc}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }} />
                )}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
                <div
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {item.rank}
                </div>
                {isReel && (
                  <div className="absolute top-1.5 left-1.5">
                    <span className="material-symbols-outlined text-white text-sm drop-shadow" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </div>
                )}
                <p className="absolute bottom-1.5 right-1.5 left-1.5 text-[10px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">
                  {item.aiTitle || item.captionExcerpt}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // === DEFAULT: horizontal scroll with snap ===
  return (
    <section className="mb-8" dir="rtl">
      <div className="px-4">
        <SectionHeader title={title} subtitle={subtitle} />
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-3"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {items.map((item, idx) => (
            <div key={item.postId || item.shortcode || `${slug}-${idx}`} className="snap-start">
              <DiscoveryCard
                item={item}
                color={color}
                onClick={(it) => onItemClick(it, title, slug)}
              />
            </div>
          ))}
        </div>

        {/* Desktop scroll arrows */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow-md items-center justify-center hover:bg-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg" style={{ color: '#191c1e' }}>chevron_right</span>
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow-md items-center justify-center hover:bg-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg" style={{ color: '#191c1e' }}>chevron_left</span>
          </button>
        )}

        {/* Fade edge */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-[5]" style={{ background: 'linear-gradient(to right, #f8f9fb, transparent)' }} />
      </div>

      {/* Scroll indicator dots */}
      {items.length > 3 && (
        <div className="flex justify-center gap-1 mt-1">
          {items.map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: i === 0 ? '#7c3aed' : '#d4d4d8' }} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex justify-between items-center mb-3">
      <div>
        <h2 className="text-[15px] font-bold" style={{ color: '#191c1e' }}>{title}</h2>
        {subtitle && <p className="text-[11px]" style={{ color: '#4a4455' }}>{subtitle}</p>}
      </div>
      <button
        className="text-[12px] font-bold px-3 py-1 rounded-full transition-colors hover:opacity-80"
        style={{ color: '#630ed4', backgroundColor: 'rgba(99, 14, 212, 0.08)' }}
      >
        הכל
      </button>
    </div>
  );
}
