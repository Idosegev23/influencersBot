'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  dot?: boolean;
}

export function Badge({ className, variant = 'neutral', dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'ui-badge',
        `ui-badge-${variant}`,
        className,
      )}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}
