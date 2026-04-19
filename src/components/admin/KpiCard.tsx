import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/sparkline';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  description?: string;
  icon?: React.ElementType;
  iconColor?: string;
  delta?: number | null;
  deltaLabel?: string;
  spark?: number[];
  loading?: boolean;
  sheen?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  iconColor,
  delta,
  deltaLabel,
  spark,
  loading,
  sheen,
  className,
}: KpiCardProps) {
  const deltaDir: 'up' | 'down' | 'flat' = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const DeltaIcon = deltaDir === 'up' ? ArrowUpRight : deltaDir === 'down' ? ArrowDownRight : Minus;
  const deltaStyles = {
    up: 'text-[color:var(--success)] bg-[color:var(--success-soft)]',
    down: 'text-[color:var(--danger)] bg-[color:var(--danger-soft)]',
    flat: 'text-[color:var(--ink-500)] bg-[color:var(--ink-100)]',
  }[deltaDir];

  return (
    <Card className={cn('relative overflow-hidden', sheen && 'ui-kpi-sheen', className)}>
      <div className="relative px-5 py-5 flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span
                className="w-7 h-7 rounded-[7px] flex items-center justify-center bg-[color:var(--ink-100)] ring-1 ring-[color:var(--line)]"
                style={iconColor ? { color: iconColor } : undefined}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              </span>
            )}
            <span className="text-[12.5px] font-medium text-[color:var(--ink-600)]">{label}</span>
          </div>
          {delta != null && (
            <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold', deltaStyles)}>
              <DeltaIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
              {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {loading ? (
              <div className="h-8 w-24 rounded-md bg-[color:var(--ink-100)] animate-pulse" />
            ) : (
              <div className="font-display font-semibold text-[28px] leading-none tracking-tight text-[color:var(--ink-900)] tabular-nums">
                {value}
              </div>
            )}
            {description && (
              <p className="mt-1.5 text-[11.5px] text-[color:var(--ink-500)]">{description}</p>
            )}
            {deltaLabel && delta != null && (
              <p className="mt-1.5 text-[11.5px] text-[color:var(--ink-500)]">{deltaLabel}</p>
            )}
          </div>
          {spark && spark.length > 1 && (
            <Sparkline values={spark} width={84} height={32} />
          )}
        </div>
      </div>
    </Card>
  );
}
