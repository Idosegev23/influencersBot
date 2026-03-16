'use client';

import { Marquee } from '@/components/ui/marquee';
import { DiscoveryCard } from './DiscoveryCard';
import type { DiscoveryItem } from '@/lib/discovery/types';

interface DiscoveryRowProps {
  title: string;
  subtitle: string;
  color: string;
  items: DiscoveryItem[];
  onItemClick: (item: DiscoveryItem, categoryTitle: string, categorySlug: string) => void;
  slug: string;
  reverse?: boolean;
  duration?: number;
}

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug, reverse = false, duration = 30 }: DiscoveryRowProps) {
  return (
    <div className="mb-5">
      {/* Category header — centered like the marquee */}
      <div className="w-[60%] mx-auto mb-2" dir="rtl">
        <h3 className="text-[16px] font-bold leading-tight" style={{ color: '#0c1013' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12px] mt-0.5" style={{ color: '#676767' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Centered marquee container with fade edges */}
      <div className="w-[60%] mx-auto relative overflow-hidden">
        <Marquee
          reverse={reverse}
          pauseOnHover
          duration={duration}
          repeat={10}
          gap="0.75rem"
        >
          {items.map((item, idx) => (
            <DiscoveryCard
              key={item.postId || item.shortcode || `${slug}-${idx}`}
              item={item}
              color={color}
              onClick={(clickedItem) => onItemClick(clickedItem, title, slug)}
            />
          ))}
        </Marquee>

        {/* Fade edges */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1/5 z-10"
          style={{ background: 'linear-gradient(to right, #f4f5f7, transparent)' }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/5 z-10"
          style={{ background: 'linear-gradient(to left, #f4f5f7, transparent)' }}
        />
      </div>
    </div>
  );
}
