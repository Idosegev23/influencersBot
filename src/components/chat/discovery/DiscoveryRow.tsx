'use client';

import { useRef, useState, useEffect } from 'react';
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
  const [activeIndex, setActiveIndex] = useState(0);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const sl = Math.abs(el.scrollLeft);
    setCanScrollRight(sl > 10);
    setCanScrollLeft(sl + el.clientWidth < el.scrollWidth - 10);

    // Calculate active dot index based on scroll position
    const cardWidth = 140 + 12; // min-w-[140px] + gap-3
    const idx = Math.round(sl / cardWidth);
    setActiveIndex(Math.min(idx, items.length - 1));
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
    const featured = items[0];
    const featuredThumb = featured.thumbnailUrl
      ? getProxiedImageUrl(featured.thumbnailUrl, featured.shortcode)
      : featured.shortcode
        ? getProxiedImageByShortcode(featured.shortcode)
        : null;
    const featuredIsReel = featured.mediaType === 'reel' || featured.mediaType === 'video';
    const tags = (featured as any).tags || [];

    return (
      <section className="mb-8 px-4" dir="rtl">
        <SectionHeader title={title} subtitle={subtitle} />

        {/* Single column layout */}
        <div className="grid grid-cols-1 gap-3">
          {/* Featured card */}
          <button
            onClick={() => onItemClick(featured, title, slug)}
            className="relative w-full overflow-hidden rounded-2xl group active:scale-[0.98] transition-transform"
            style={{ aspectRatio: '16/10' }}
          >
            {featuredThumb ? (
              <img
                src={featuredThumb}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />

            {/* Editor's pick badge — top right */}
            <div className="absolute top-3 right-3 z-10 bg-[#7c3aed] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              נבחר העורכים
            </div>

            {featuredIsReel && (
              <div className="absolute top-3 left-3 z-10">
                <span className="material-symbols-outlined text-white text-lg drop-shadow" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              </div>
            )}

            {/* Bottom overlay: tag pills + title */}
            <div className="absolute bottom-0 right-0 left-0 p-4 z-10">
              {tags.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {tags.slice(0, 3).map((tag: string, i: number) => (
                    <span key={i} className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-2xl font-bold text-white leading-tight drop-shadow-sm line-clamp-2">
                {featured.aiTitle || featured.captionExcerpt}
              </p>
            </div>
          </button>

          {/* Two stacked cards */}
          {items.slice(1, 3).length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.slice(1, 3).map((item, idx) => {
                const thumb = item.thumbnailUrl
                  ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
                  : item.shortcode
                    ? getProxiedImageByShortcode(item.shortcode)
                    : null;
                const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
                return (
                  <button
                    key={item.postId || item.shortcode || `${slug}-${idx + 1}`}
                    onClick={() => onItemClick(item, title, slug)}
                    className="relative h-[180px] overflow-hidden rounded-2xl group active:scale-[0.96] transition-transform"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : (
                      <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }} />
                    )}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)' }} />
                    {isReel && (
                      <div className="absolute top-2 left-2">
                        <span className="material-symbols-outlined text-white text-sm drop-shadow" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </div>
                    )}
                    <p className="absolute bottom-3 right-3 left-3 text-sm font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">
                      {item.aiTitle || item.captionExcerpt}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Optional horizontal mini topic chips */}
        {items.length > 3 && (
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-2">
            {items.slice(3).map((item, idx) => (
              <button
                key={item.postId || item.shortcode || `${slug}-${idx + 3}`}
                onClick={() => onItemClick(item, title, slug)}
                className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors hover:opacity-80 active:scale-95"
                style={{ backgroundColor: `${color}15`, color }}
              >
                {item.aiTitle || item.captionExcerpt}
              </button>
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
        <SectionHeader title={title} subtitle={subtitle} items={items} activeIndex={activeIndex} layout="scroll" />
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-3"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {items.map((item, idx) => {
            const thumbnailSrc = item.thumbnailUrl
              ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
              : item.shortcode
                ? getProxiedImageByShortcode(item.shortcode)
                : null;
            const isReel = item.mediaType === 'reel' || item.mediaType === 'video';

            return (
              <div key={item.postId || item.shortcode || `${slug}-${idx}`} className="snap-start">
                <button
                  onClick={() => onItemClick(item, title, slug)}
                  className="relative min-w-[140px] h-[200px] overflow-hidden rounded-2xl group active:scale-[0.96] transition-transform"
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

                  {/* Rank badge */}
                  <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-md rounded-full px-2 py-0.5 text-[9px] font-bold text-white">
                    #{item.rank}
                  </div>

                  {isReel && (
                    <div className="absolute top-2 left-2">
                      <span className="material-symbols-outlined text-white text-sm drop-shadow" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  )}

                  <p className="absolute bottom-2 right-2 left-2 text-[11px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">
                    {item.aiTitle || item.captionExcerpt}
                  </p>
                </button>
              </div>
            );
          })}
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

        {/* Fade edge — left side only */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-[5]" style={{ background: 'linear-gradient(to right, #f8f9fb, transparent)' }} />
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
  items,
  activeIndex = 0,
  layout,
}: {
  title: string;
  subtitle: string;
  items?: DiscoveryItem[];
  activeIndex?: number;
  layout?: string;
}) {
  return (
    <div className="flex justify-between items-center mb-3">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: '#191c1e' }}>{title}</h2>
          {subtitle && <p className="text-[11px]" style={{ color: '#4a4455' }}>{subtitle}</p>}
        </div>

        {/* Scroll indicator dots — next to title for scroll layout */}
        {layout === 'scroll' && items && items.length > 3 && (
          <div className="flex gap-1 items-center">
            {items.map((_, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: '3px',
                  height: '3px',
                  backgroundColor: i === activeIndex ? '#7c3aed' : '#d4d4d8',
                }}
              />
            ))}
          </div>
        )}
      </div>
      <button
        className="text-[13px] font-bold px-4 py-1 rounded-full transition-colors hover:opacity-80"
        style={{ color: '#630ed4', backgroundColor: 'rgba(99, 14, 212, 0.1)' }}
      >
        הכל
      </button>
    </div>
  );
}
