import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--ink-500)] mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-semibold text-[26px] md:text-[28px] leading-tight text-[color:var(--ink-900)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[13.5px] text-[color:var(--ink-500)] max-w-prose">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
