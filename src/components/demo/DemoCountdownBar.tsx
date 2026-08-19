'use client';

/**
 * "נותרו N ימים להתנסות" — the slim bar above a live demo.
 *
 * Renders NOTHING unless the account is a timed demo (`daysLeft !== null`), so
 * every paying account and every demo predating this feature is visually
 * untouched. That check is the component's whole compatibility story.
 */

import { Clock } from 'lucide-react';
import { BESTIE_PRIMARY } from '@/lib/widget/banner';
import type { DemoAccess } from '@/lib/demo/access';

interface Props {
  access: Pick<DemoAccess, 'state' | 'daysLeft'>;
  /** Chat page sits on Bestie purple; the widget demo sits on the brand's colour. */
  surface?: 'chat' | 'widget';
}

function label(daysLeft: number): string {
  if (daysLeft <= 0) return 'ההתנסות מסתיימת היום';
  if (daysLeft === 1) return 'נותר יום אחד להתנסות';
  return `נותרו ${daysLeft} ימים להתנסות`;
}

export function DemoCountdownBar({ access, surface = 'chat' }: Props) {
  // Not a timed demo, or already locked (the lock screen speaks for itself).
  if (access.daysLeft === null || access.state === 'locked') return null;

  const urgent = access.state === 'expiring';
  const bg = urgent ? '#FEF3C7' : surface === 'chat' ? '#F5EDFE' : '#F3F4F6';
  const fg = urgent ? '#92400E' : surface === 'chat' ? BESTIE_PRIMARY : '#374151';

  return (
    <div
      dir="rtl"
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
      style={{ background: bg, color: fg }}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{label(access.daysLeft)}</span>
    </div>
  );
}

export default DemoCountdownBar;
