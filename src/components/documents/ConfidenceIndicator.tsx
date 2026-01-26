'use client';

import { cn } from '@/lib/utils';

export interface ConfidenceIndicatorProps {
  confidence: number; // 0-100
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceIndicator({
  confidence,
  className,
  showLabel = true,
  size = 'md',
}: ConfidenceIndicatorProps) {
  // Determine color based on confidence level
  const getColor = () => {
    if (confidence >= 90) return 'text-green-600 bg-green-100 border-green-300';
    if (confidence >= 75) return 'text-yellow-600 bg-yellow-100 border-yellow-300';
    return 'text-red-600 bg-red-100 border-red-300';
  };

  const getIcon = () => {
    if (confidence >= 90) return '✓';
    if (confidence >= 75) return '⚠';
    return '✗';
  };

  const getLabel = () => {
    if (confidence >= 90) return 'ביטחון גבוה';
    if (confidence >= 75) return 'ביטחון בינוני';
    return 'ביטחון נמוך';
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border font-medium',
          getColor(),
          sizeClasses[size]
        )}
      >
        <span>{getIcon()}</span>
        <span>{confidence}%</span>
      </span>
      {showLabel && (
        <span className="text-sm text-gray-600">{getLabel()}</span>
      )}
    </div>
  );
}

// Progress bar version
export function ConfidenceBar({
  confidence,
  className,
}: {
  confidence: number;
  className?: string;
}) {
  const getBarColor = () => {
    if (confidence >= 90) return 'bg-green-500';
    if (confidence >= 75) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">רמת ביטחון</span>
        <span className="text-xs font-medium">{confidence}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', getBarColor())}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}
