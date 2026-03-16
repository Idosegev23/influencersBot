'use client';

import { Marquee } from '@/components/ui/marquee';
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
  reverse?: boolean;
}

export function DiscoveryRow({ title, subtitle, color, items, onItemClick, slug, reverse = false }: DiscoveryRowProps) {
  const speed = Math.max(25, items.length * 8);

  return (
    <div className="mb-6">
      {/* Category header */}
      <div className="px-4 mb-2.5" dir="rtl">
        <h3 className="text-[16px] font-bold leading-tight" style={{ color: '#0c1013' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12px] mt-0.5" style={{ color: '#676767' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Marquee with fade edges */}
      <div className="relative flex w-full items-center overflow-hidden">
        <Marquee
          reverse={reverse}
          pauseOnHover
          duration={speed}
          repeat={4}
          className="[--gap:0.75rem]"
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

        {/* Left fade */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[60px] z-10"
          style={{ background: 'linear-gradient(to right, #f4f5f7, transparent)' }}
        />
        {/* Right fade */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[60px] z-10"
          style={{ background: 'linear-gradient(to left, #f4f5f7, transparent)' }}
        />
      </div>
    </div>
  );
}
