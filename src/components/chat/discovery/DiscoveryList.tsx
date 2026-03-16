'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { DiscoveryListData, DiscoveryItem } from '@/lib/discovery/types';
import { DiscoveryListItem } from './DiscoveryListItem';
import { ListSkeleton } from './DiscoveryLoading';

interface DiscoveryListProps {
  data: DiscoveryListData | null;
  loading: boolean;
  onBack: () => void;
  onAskAbout: (item: DiscoveryItem) => void;
}

export function DiscoveryList({ data, loading, onBack, onAskAbout }: DiscoveryListProps) {
  if (loading) {
    return (
      <div>
        {/* Header with back button */}
        <div className="flex items-center gap-2 p-4 pb-2">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5" style={{ color: '#676767' }} />
          </button>
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <ListSkeleton />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 p-4 pb-2">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5" style={{ color: '#676767' }} />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-[16px]" style={{ color: '#676767' }}>
            אין תוכן זמין לקטגוריה זו
          </p>
        </div>
      </div>
    );
  }

  const { category, items } = data;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
      className="overflow-y-auto pb-32"
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-4 pb-1">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          style={{ backgroundColor: '#f4f5f7' }}
        >
          <ChevronRight className="w-5 h-5" style={{ color: '#676767' }} />
        </button>
        <div className="flex-1">
          <h2 className="text-[20px] font-bold" style={{ color: '#0c1013' }}>
            {category.title}
          </h2>
          <p className="text-[13px]" style={{ color: '#676767' }}>
            {category.subtitle}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 pt-3 space-y-2.5">
        {items.map((item, i) => (
          <DiscoveryListItem
            key={item.postId || item.shortcode || i}
            item={item}
            index={i}
            color={category.color}
            onAskAbout={onAskAbout}
          />
        ))}
      </div>
    </motion.div>
  );
}
