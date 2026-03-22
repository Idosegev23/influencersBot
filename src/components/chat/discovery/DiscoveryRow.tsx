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
    <section className="mb-10">
      {/* Section header — per Stitch: px-6, flex justify-between, "הכל" button */}
      <div className="px-6 flex justify-between items-end mb-4" dir="rtl">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#191c1e' }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs" style={{ color: '#4a4455' }}>
              {subtitle}
            </p>
          )}
        </div>
        <button className="text-sm font-bold" style={{ color: '#630ed4' }}>
          הכל
        </button>
      </div>

      {/* Horizontal scroll with marquee — full width px-6 per Stitch */}
      <div className="relative overflow-hidden">
        <div className="px-6">
          <Marquee
            reverse={reverse}
            pauseOnHover
            duration={duration}
            repeat={10}
            gap="1rem"
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

        {/* Fade edges — match surface bg #f8f9fb per Stitch */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10"
          style={{ background: 'linear-gradient(to right, #f8f9fb, transparent)' }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10"
          style={{ background: 'linear-gradient(to left, #f8f9fb, transparent)' }}
        />
      </div>
    </section>
  );
}
