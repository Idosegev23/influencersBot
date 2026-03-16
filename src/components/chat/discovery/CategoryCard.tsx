'use client';

import { motion } from 'framer-motion';
import {
  Play, Heart, MessageCircle, TrendingUp, Flame, Film,
  Lightbulb, Camera, Star, ShoppingBag, MapPin, HelpCircle,
  AlertTriangle, Sun, MessageSquare,
} from 'lucide-react';
import type { DiscoveryCategoryAvailability } from '@/lib/discovery/types';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Play, Heart, MessageCircle, TrendingUp, Flame, Film,
  Lightbulb, Camera, Star, ShoppingBag, MapPin, HelpCircle,
  AlertTriangle, Sun, MessageSquare,
};

interface CategoryCardProps {
  category: DiscoveryCategoryAvailability;
  index: number;
  onTap: (slug: string) => void;
}

export function CategoryCard({ category, index, onTap }: CategoryCardProps) {
  const Icon = ICON_MAP[category.icon] || Star;
  const isInteractive = category.type === 'interactive';

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => onTap(category.slug)}
      className="w-full text-right rounded-[20px] p-4 transition-all hover:shadow-md relative overflow-hidden"
      style={{
        backgroundColor: isInteractive ? '#ffffff' : category.bgColor,
        border: isInteractive ? `2px solid ${category.color}` : '1px solid #e5e5ea',
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-2.5"
        style={{ backgroundColor: `${category.color}20` }}
      >
        <Icon className="w-[20px] h-[20px]" style={{ color: category.color }} />
      </div>

      {/* Title */}
      <h3
        className="text-[14px] font-bold leading-tight mb-1"
        style={{ color: '#0c1013' }}
      >
        {category.title}
      </h3>

      {/* Subtitle */}
      <p className="text-[12px] leading-tight" style={{ color: '#676767' }}>
        {category.subtitle}
      </p>

      {/* Item count badge */}
      {category.itemCount > 0 && !isInteractive && (
        <div
          className="absolute top-3 left-3 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center"
          style={{ backgroundColor: category.color, color: '#fff' }}
        >
          {category.itemCount}
        </div>
      )}

      {/* Interactive highlight pulse */}
      {isInteractive && (
        <div
          className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ backgroundColor: category.color }}
        />
      )}
    </motion.button>
  );
}
