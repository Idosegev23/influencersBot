'use client';

import { AnalyticsLoader } from './AnalyticsLoader';
import { useAutoAnalytics } from '@/lib/analytics/hooks';

/**
 * Root-level wrapper: loads the 3 pixels and starts the auto-tracking
 * hook (page_load / route_change / scroll_depth / focus / blur / errors
 * / session_start|end). Anything else fires explicitly via track(...).
 */
export function AnalyticsClient() {
  useAutoAnalytics();
  return <AnalyticsLoader />;
}
