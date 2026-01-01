'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';

export interface ProgressData {
  current: number;
  total: number;
  label?: string;
  steps?: string[];
}

interface InlineProgressProps extends ProgressData {}

export function InlineProgress({ current, total, label, steps }: InlineProgressProps) {
  const percentage = Math.min(100, Math.round((current / total) * 100));

  return (
    <div className="w-full bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">
          {label || 'מתקדמים...'}
        </span>
        <span className="text-xs font-mono text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
          {current}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
        />
        
        {/* Shimmer effect */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ 
            duration: 1.5, 
            repeat: Infinity, 
            repeatDelay: 1,
            ease: 'linear',
          }}
          className="absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        />
      </div>

      {/* Steps (if provided) */}
      {steps && steps.length > 0 && (
        <div className="flex items-center justify-between gap-1">
          {steps.map((step, i) => {
            const isComplete = i + 1 < current;
            const isCurrent = i + 1 === current;

            return (
              <div
                key={i}
                className={`
                  flex items-center gap-1 text-xs
                  ${isComplete ? 'text-green-600' : isCurrent ? 'text-purple-600 font-medium' : 'text-gray-400'}
                `}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : isCurrent ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Circle className="w-3.5 h-3.5 fill-current" />
                  </motion.div>
                ) : (
                  <Circle className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline truncate max-w-[80px]">{step}</span>
                {i < steps.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-gray-300 hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

