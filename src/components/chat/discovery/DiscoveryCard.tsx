'use client';

import { Play } from 'lucide-react';
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

export function DiscoveryCard({ item, color, onClick }: DiscoveryCardProps) {
  const displayTitle = item.aiTitle || item.captionExcerpt;
  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
  const metricText = formatMetric(item.metricValue, item.metricLabel);

  return (
    <button
      onClick={() => onClick(item)}
      className="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-gray-950/[.08] hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
      style={{ width: 140, height: 240 }}
    >
      {/* Full-bleed image — 9:16 portrait ratio */}
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
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

      {/* Dark gradient from bottom for text readability */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 40%, transparent 70%)' }}
      />

      {/* Play icon for reels */}
      {isReel && (
        <div className="absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
        </div>
      )}

      {/* Rank badge */}
      <div
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shadow-md"
        style={{ backgroundColor: color }}
      >
        {item.rank}
      </div>

      {/* Bottom content — title + metric overlaid on image */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8" dir="rtl">
        <p className="text-[13px] font-bold leading-snug line-clamp-2 text-white drop-shadow-md">
          {displayTitle}
        </p>
        {metricText && (
          <span
            className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: `${color}cc` }}
          >
            {metricText} {item.metricLabel}
          </span>
        )}
      </div>
    </button>
  );
}
