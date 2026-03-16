'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6"
    >
      {/* Category header */}
      <div className="flex items-center justify-between px-4 mb-2.5" dir="rtl">
        <div>
          <h3 className="text-[17px] font-bold leading-tight text-white">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[12px] mt-0.5 text-white/50">
              {subtitle}
            </p>
          )}
        </div>
        {/* Scroll hint arrow */}
        <button
          onClick={scrollLeft}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-white/70" />
        </button>
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-2"
        dir="rtl"
        style={{ scrollPaddingInlineStart: 16 }}
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
    </motion.div>
  );
}
