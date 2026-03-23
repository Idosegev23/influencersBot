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
  layout?: 'masonry';
}

function getThumb(item: DiscoveryItem) {
  return item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;
}

/** Pinterest-style masonry layout — all cards portrait (9:16 or 4:5) */
export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug }: DiscoveryRowProps) {
  return (
    <section className="space-y-3" dir="rtl">
      <SectionHeader title={title} subtitle={subtitle} color={color} />
      <div className="columns-2 sm:columns-3 gap-[10px]" style={{ columnFill: 'balance' }}>
        {items.slice(0, 9).map((item, idx) => {
          const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
          // Reels/videos → 9:16, images → 4:5
          const aspect = isReel ? 'aspect-[9/16]' : 'aspect-[4/5]';

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
    </section>
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
      className={`relative w-full ${aspect} rounded-2xl overflow-hidden active:scale-[0.97] transition-transform mb-[10px] break-inside-avoid`}
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
