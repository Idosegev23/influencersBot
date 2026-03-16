'use client';

import { motion } from 'framer-motion';

/**
 * Skeleton loading for category grid
 */
export function CategoryGridSkeleton() {
  return (
    <div className="px-4 pt-4">
      {/* Header skeleton */}
      <div className="text-center mb-5">
        <div className="h-6 w-32 bg-gray-200 rounded-full mx-auto mb-2 animate-pulse" />
        <div className="h-4 w-52 bg-gray-100 rounded-full mx-auto animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-[20px] p-4 h-[120px] animate-pulse"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5ea' }}
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 mb-3" />
            <div className="h-3.5 w-3/4 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-1/2 bg-gray-100 rounded" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton loading for list items
 */
export function ListSkeleton() {
  return (
    <div className="p-4 space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-center gap-3 rounded-[20px] p-3.5 animate-pulse"
          style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5ea' }}
        >
          <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0" />
          <div className="w-16 h-16 rounded-[14px] bg-gray-100 flex-shrink-0" />
          <div className="flex-1">
            <div className="h-3.5 w-3/4 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-1/2 bg-gray-100 rounded" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
