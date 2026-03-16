'use client';

import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryCardProps {
  item: DiscoveryItem;
  color: string;
  index: number;
  onClick: (item: DiscoveryItem) => void;
}

function formatMetric(value: number | undefined, label: string | undefined): string {
  if (value == null || !label) return '';
  if (label === '% מעורבות') return `${value}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('he-IL');
}

export function DiscoveryCard({ item, color, index, onClick }: DiscoveryCardProps) {
  const displayTitle = item.aiTitle || item.captionExcerpt;
  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  const isReel = item.mediaType === 'reel' || item.mediaType === 'video';
  const metricText = formatMetric(item.metricValue, item.metricLabel);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      onClick={() => onClick(item)}
      className="flex-shrink-0 snap-start text-right"
      style={{ width: 140 }}
    >
      {/* Thumbnail */}
      <div
        className="relative w-full overflow-hidden bg-gray-100"
        style={{ height: 140, borderRadius: 16 }}
      >
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
            <span className="text-3xl opacity-40">📷</span>
          </div>
        )}

        {/* Play icon for reels */}
        {isReel && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-3 h-3 text-white fill-white" />
          </div>
        )}

        {/* Metric badge */}
        {metricText && (
          <div
            className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          >
            {metricText}
          </div>
        )}

        {/* Rank badge */}
        <div
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {item.rank}
        </div>
      </div>

      {/* Title */}
      <p
        className="mt-1.5 text-[13px] font-medium leading-tight line-clamp-2 px-0.5"
        style={{ color: '#0c1013' }}
        dir="rtl"
      >
        {displayTitle}
      </p>
    </motion.button>
  );
}
