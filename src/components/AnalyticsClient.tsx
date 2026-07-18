'use client';

import { usePathname } from 'next/navigation';
import { AnalyticsLoader } from './AnalyticsLoader';
import { useAutoAnalytics } from '@/lib/analytics/hooks';
import { analyticsSurface } from '@/lib/analytics/surface';

/**
 * Runs the auto-tracking hook. Split into its own component so the parent can
 * mount/unmount it by surface without breaking the Rules of Hooks.
 */
function AutoAnalytics() {
  useAutoAnalytics();
  return null;
}

/**
 * Root-level wrapper. Analytics is ALLOWLISTED by surface: it loads the pixels
 * and the auto-tracking hook only on the public marketing site and the account
 * chat. On admin, dashboards, and every [token] route it renders nothing, so no
 * page_load / route_change ever ships the current path — which on /sign, /invoice,
 * /onboard, /reply, /feedback is a secret token — to gtag / Meta / TikTok.
 */
export function AnalyticsClient() {
  const pathname = usePathname();
  const surface = analyticsSurface(pathname);

  if (surface === 'none') return null;

  return (
    <>
      <AutoAnalytics />
      <AnalyticsLoader />
    </>
  );
}
