'use client';

import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryCardProps {
  item: DiscoveryItem;
  color: string;
  onClick: (item: DiscoveryItem) => void;
}

function formatMetric(value: number | undefined, label: string | undefined): string {
  if (value == null || !label) return '';
  if (label === '% מעורבות') return `${value}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('he-IL');
}

/** Pick a Material Symbols icon based on the metric label */
function metricIcon(label: string | undefined): string {
  if (!label) return 'trending_up';
  if (label.includes('צפיות')) return 'visibility';
  if (label.includes('לייקים') || label.includes('אהבות')) return 'favorite';
  if (label.includes('תגובות')) return 'chat_bubble';
  if (label.includes('שיתופים')) return 'share';
  if (label.includes('מעורבות')) return 'monitoring';
  return 'trending_up';
}

export function DiscoveryCard({ item, color, onClick }: DiscoveryCardProps) {
  const displayTitle = item.aiTitle || item.captionExcerpt;
  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
  const metricText = formatMetric(item.metricValue, item.metricLabel);

  // Rank #1 gets primary purple bg, others get white/90
  const isFirst = item.rank === 1;

  return (
    <button
      onClick={() => onClick(item)}
      className="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-[20px] border border-black/[.04] hover:scale-[1.03] active:scale-[0.95] transition-all duration-200 group"
      style={{
        width: 140,
        height: 240,
        boxShadow: '0px 20px 40px rgba(12, 16, 19, 0.06)',
      }}
    >
      {/* Full-bleed image — 9:16 portrait ratio */}
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
        >
          <span className="text-3xl opacity-25">📷</span>
        </div>
      )}

      {/* Dark gradient from bottom */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, transparent 60%)' }}
      />

      {/* Play icon for reels — backdrop-blur pill per Stitch */}
      {isReel && (
        <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
          <span
            className="material-symbols-outlined text-white text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            play_arrow
          </span>
        </div>
      )}

      {/* Rank badge — #1 gets primary color, rest get white/90 */}
      <div
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md"
        style={{
          backgroundColor: isFirst ? '#7c3aed' : 'rgba(255,255,255,0.9)',
          color: isFirst ? '#ffffff' : '#191c1e',
        }}
      >
        {item.rank}
      </div>

      {/* Bottom content — metric pill + title */}
      <div className="absolute bottom-3 right-3 left-3 flex flex-col gap-1.5" dir="rtl">
        {metricText && (
          <span className="bg-white/10 backdrop-blur-md text-white text-[10px] px-2 py-0.5 rounded-full self-start flex items-center gap-1">
            <span
              className="material-symbols-outlined text-[10px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {metricIcon(item.metricLabel)}
            </span>
            {metricText}
          </span>
        )}
        <h3 className="text-white text-[13px] font-bold leading-tight line-clamp-2">
          {displayTitle}
        </h3>
      </div>
    </button>
  );
}
