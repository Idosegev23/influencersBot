'use client';

import SupportAnalytics from '@/components/agent/SupportAnalytics';

// Kept for old bookmarks; the support page now links to
// /influencer/<account>/support/analytics for every account.
export default function LabeauteAnalyticsPage() {
  return <SupportAnalytics accountUsername="labeaute.israel" />;
}
