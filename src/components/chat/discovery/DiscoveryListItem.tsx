'use client';

import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { getProxiedImageUrl, getProxiedImageByShortcode } from '@/lib/image-utils';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryListItemProps {
  item: DiscoveryItem;
  index: number;
  color: string;
  onAskAbout: (item: DiscoveryItem) => void;
}

function formatMetric(value: number | undefined, label: string | undefined): string {
  if (value == null || !label) return '';
  if (label === '% מעורבות') return `${value}% מעורבות`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ${label}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K ${label}`;
  return `${value.toLocaleString('he-IL')} ${label}`;
}

export function DiscoveryListItem({ item, index, color, onAskAbout }: DiscoveryListItemProps) {
  const displayTitle = item.aiTitle || item.captionExcerpt;
  // Use CDN URL with shortcode fallback for expired URLs
  const thumbnailSrc = item.thumbnailUrl
    ? getProxiedImageUrl(item.thumbnailUrl, item.shortcode)
    : item.shortcode
      ? getProxiedImageByShortcode(item.shortcode)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="flex items-start gap-3 rounded-[20px] p-3.5 transition-all hover:shadow-sm"
      style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5ea' }}
    >
      {/* Rank number */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[15px]"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {item.rank}
      </div>

      {/* Thumbnail */}
      {thumbnailSrc && (
        <div className="w-16 h-16 rounded-[14px] overflow-hidden flex-shrink-0 bg-gray-100">
          <img
            src={thumbnailSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-semibold leading-tight mb-1 line-clamp-2"
          style={{ color: '#0c1013' }}
          dir="rtl"
        >
          {displayTitle}
        </p>

        {/* AI summary */}
        {item.aiSummary && (
          <p className="text-[12px] leading-tight line-clamp-2 mb-1.5" style={{ color: '#676767' }}>
            {item.aiSummary}
          </p>
        )}

        {/* Metric badge */}
        {item.metricValue != null && item.metricLabel && (
          <span
            className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {formatMetric(item.metricValue, item.metricLabel)}
          </span>
        )}

        {/* Action row: ask in chat + link to post */}
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => onAskAbout(item)}
            className="text-[12px] font-medium transition-colors hover:underline"
            style={{ color }}
          >
            שאלו על זה בצ׳אט →
          </button>
          {item.postUrl && (
            <a
              href={item.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] transition-colors hover:underline"
              style={{ color: '#999' }}
            >
              <ExternalLink className="w-3 h-3" />
              <span>לפוסט</span>
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
