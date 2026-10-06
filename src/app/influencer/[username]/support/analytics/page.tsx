'use client';

import { useParams } from 'next/navigation';
import SupportAnalytics from '@/components/agent/SupportAnalytics';

export default function AccountSupportAnalyticsPage() {
  const { username } = useParams<{ username: string }>();
  return <SupportAnalytics accountUsername={decodeURIComponent(username)} />;
}
