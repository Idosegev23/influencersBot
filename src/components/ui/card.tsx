'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, DivProps & { interactive?: boolean; hover?: boolean }>(
  function Card({ className, interactive, hover, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'ui-card',
          interactive && 'ui-card-interactive',
          hover && 'ui-card-hover',
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardHeader = React.forwardRef<HTMLDivElement, DivProps>(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-5 pt-5 pb-3 flex flex-col gap-1', className)} {...props} />;
});

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return <h3 ref={ref} className={cn('text-[15px] font-semibold font-display text-[color:var(--ink-900)] leading-tight', className)} {...props} />;
});

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-[13px] text-[color:var(--ink-500)] leading-relaxed', className)} {...props} />;
  },
);

export const CardContent = React.forwardRef<HTMLDivElement, DivProps>(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-5 pb-5', className)} {...props} />;
});

export const CardFooter = React.forwardRef<HTMLDivElement, DivProps>(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-5 pb-4 pt-3 border-t border-[color:var(--line)] flex items-center gap-2', className)} {...props} />;
});
