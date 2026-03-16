'use client';

import { motion } from 'framer-motion';
import type { DiscoveryCategoryAvailability } from '@/lib/discovery/types';
import { CategoryCard } from './CategoryCard';
import { CategoryGridSkeleton } from './DiscoveryLoading';

interface CategoryGridProps {
  categories: DiscoveryCategoryAvailability[];
  loading: boolean;
  onSelectCategory: (slug: string) => void;
  onSelectQuestions: () => void;
}

export function CategoryGrid({ categories, loading, onSelectCategory, onSelectQuestions }: CategoryGridProps) {
  if (loading) return <CategoryGridSkeleton />;

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-[16px] font-medium mb-2" style={{ color: '#0c1013' }}>
          אין תוכן זמין עדיין
        </p>
        <p className="text-[14px]" style={{ color: '#676767' }}>
          התוכן ייווצר אוטומטית כשיהיה מספיק מידע
        </p>
      </div>
    );
  }

  const handleTap = (slug: string) => {
    if (slug === 'questions') {
      onSelectQuestions();
    } else {
      onSelectCategory(slug);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="overflow-y-auto px-4 pb-32"
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      {/* Header */}
      <div className="text-center mb-5 pt-4">
        <h2 className="text-[22px] font-bold" style={{ color: '#0c1013' }}>
          גלו תוכן
        </h2>
        <p className="text-[14px] mt-1" style={{ color: '#676767' }}>
          בחרו קטגוריה וגלו דברים מעניינים
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {categories.map((cat, i) => (
          <CategoryCard
            key={cat.slug}
            category={cat}
            index={i}
            onTap={handleTap}
          />
        ))}
      </div>
    </motion.div>
  );
}
