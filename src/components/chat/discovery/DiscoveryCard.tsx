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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      whileHover={{ scale: 1.05, zIndex: 10 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onClick(item)}
      className="flex-shrink-0 snap-start relative group"
      style={{ width: 220 }}
    >
      {/* Card container — 16:10 cinematic ratio */}
      <div
        className="relative w-full overflow-hidden shadow-lg"
        style={{
          height: 138,
          borderRadius: 10,
          backgroundColor: '#1a1a2e',
        }}
      >
        {/* Image */}
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${color}40, ${color}15)` }}
          >
            <span className="text-4xl opacity-30">📷</span>
          </div>
        )}

        {/* Dark gradient overlay — bottom half */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
          }}
        />

        {/* Play icon for reels */}
        {isReel && (
          <div className="absolute top-3 left-3 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
          </div>
        )}

        {/* Rank badge — top right */}
        <div
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shadow-md"
          style={{ backgroundColor: color, boxShadow: `0 2px 8px ${color}60` }}
        >
          {item.rank}
        </div>

        {/* Bottom content — title + metric on the image */}
        <div className="absolute bottom-0 right-0 left-0 px-3 pb-2.5 pt-6" dir="rtl">
          <p className="text-[13px] font-bold leading-snug line-clamp-2 text-white drop-shadow-md">
            {displayTitle}
          </p>
          {metricText && (
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}cc`, color: '#fff' }}
              >
                {metricText}
              </span>
              {item.metricLabel && (
                <span className="text-[10px] text-white/60">{item.metricLabel}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
