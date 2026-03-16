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
  // Speed based on item count — more items = slower (longer to loop)
  const speed = Math.max(25, items.length * 8);

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

      {/* Marquee scroll */}
      <Marquee
        reverse={reverse}
        pauseOnHover
        duration={speed}
        repeat={3}
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
    </div>
  );
}
