'use client';

import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryCardProps {
  item: DiscoveryItem;
  color: string;
  onClick: (item: DiscoveryItem) => void;
  variant?: 'default' | 'hero' | 'wide';
}

function formatMetric(value: number | undefined, label: string | undefined): string {
  if (value == null || !label) return '';
  if (label === '% מעורבות') return `${value}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('he-IL');
}

function metricIcon(label: string | undefined): string {
  if (!label) return 'trending_up';
  if (label.includes('צפיות')) return 'visibility';
  if (label.includes('לייקים') || label.includes('אהבות')) return 'favorite';
  if (label.includes('תגובות')) return 'chat_bubble';
  if (label.includes('שיתופים')) return 'share';
  if (label.includes('מעורבות')) return 'monitoring';
  return 'trending_up';
}

const sizeMap = {
  default: { width: 140, height: 200 },
  hero: { width: 200, height: 280 },
  wide: { width: 220, height: 160 },
};

export function DiscoveryCard({ item, color, onClick, variant = 'default' }: DiscoveryCardProps) {
  const displayTitle = item.aiTitle || item.captionExcerpt;
  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
  const metricText = formatMetric(item.metricValue, item.metricLabel);
  const isFirst = item.rank === 1;
  const size = sizeMap[variant];

  return (
    <button
      onClick={() => onClick(item)}
      className="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl hover:scale-[1.03] active:scale-[0.95] transition-all duration-200 group"
      style={{
        width: size.width,
        height: size.height,
        boxShadow: '0 8px 24px rgba(12, 16, 19, 0.08)',
      }}
    >
      {/* Thumbnail image */}
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
          <span className="text-3xl opacity-15" style={{ color: '#999' }}>?</span>
        </div>
      )}

      {/* Dark gradient */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 50%, transparent 70%)' }}
      />

      {/* Play icon for reels */}
      {isReel && (
        <div className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
        </div>
      )}

      {/* Rank badge */}
      <div
        className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md"
        style={{
          backgroundColor: isFirst ? '#7c3aed' : 'rgba(255,255,255,0.9)',
          color: isFirst ? '#ffffff' : '#191c1e',
        }}
      >
        {item.rank}
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-2.5 right-2.5 left-2.5 flex flex-col gap-1" dir="rtl">
        {metricText && (
          <span className="bg-white/15 backdrop-blur-md text-white text-[9px] px-1.5 py-0.5 rounded-full self-start flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[9px]" style={{ fontVariationSettings: "'FILL' 1" }}>{metricIcon(item.metricLabel)}</span>
            {metricText}
          </span>
        )}
        <h3 className="text-white text-[12px] font-bold leading-tight line-clamp-2 drop-shadow-sm">
          {displayTitle}
        </h3>
      </div>
    </button>
  );
}
