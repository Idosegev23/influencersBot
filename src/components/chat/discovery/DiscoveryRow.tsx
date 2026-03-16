'use client';

import { DiscoveryCard } from './DiscoveryCard';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryRowProps {
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  items: DiscoveryItem[];
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
  slug: string;
}

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug }: DiscoveryRowProps) {
  return (
    <div className="mb-5">
      {/* Category header */}
      <div className="px-4 mb-2" dir="rtl">
        <h3 className="text-[16px] font-bold leading-tight" style={{ color: '#0c1013' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12px] mt-0.5" style={{ color: '#676767' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Horizontal scroll */}
      <div
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-1"
        dir="rtl"
      >
        {items.map((item, idx) => (
          <DiscoveryCard
            key={item.postId || item.shortcode || `${slug}-${idx}`}
            item={item}
            color={color}
            index={idx}
            onClick={(clickedItem) => onItemClick(clickedItem, title, slug)}
          />
        ))}
      </div>
    </div>
  );
}
