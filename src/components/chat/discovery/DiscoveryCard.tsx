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
      className="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-gray-950/[.08] bg-white hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
      style={{ width: 220, height: 170 }}
    >
      {/* Image — top portion */}
      <div className="relative w-full" style={{ height: 110 }}>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
          >
            <span className="text-3xl opacity-25">📷</span>
          </div>
        )}

        {/* Play icon for reels */}
        {isReel && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-3 h-3 text-white fill-white ml-0.5" />
          </div>
        )}

        {/* Rank badge */}
        <div
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          {item.rank}
        </div>

        {/* Metric badge */}
        {metricText && (
          <div
            className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {metricText} {item.metricLabel}
          </div>
        )}
      </div>

      {/* Title — bottom portion */}
      <div className="px-3 py-2" dir="rtl">
        <p className="text-[12px] font-semibold leading-snug line-clamp-2" style={{ color: '#1a1a1a' }}>
          {displayTitle}
        </p>
      </div>
    </button>
  );
}
