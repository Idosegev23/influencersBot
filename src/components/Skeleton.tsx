'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-700/50',
        className
      )}
      style={style}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonChat() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-16 w-3/4 rounded-2xl rounded-tr-sm" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-12 w-2/3 rounded-2xl rounded-tl-sm" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-1/2 rounded-2xl rounded-tr-sm" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-20 w-4/5 rounded-2xl rounded-tl-sm" />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4 p-4 bg-gray-800/30 rounded-xl">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24 hidden sm:block" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 p-4 bg-gray-800/30 rounded-xl">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20 hidden sm:block" />
          <Skeleton className="h-4 w-12 ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return <Skeleton className={cn('rounded-full', sizeClasses[size])} />;
}

export function SkeletonButton({ width = 'w-24' }: { width?: string }) {
  return <Skeleton className={cn('h-10 rounded-lg', width)} />;
}

export function SkeletonChart() {
  return (
    <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="h-64 flex items-end justify-between gap-2">
        {[...Array(12)].map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${Math.random() * 60 + 20}%` }}
          />
        ))}
      </div>
    </div>
  );
}

