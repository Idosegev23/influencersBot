'use client';

/**
 * Branded, printable value-proof report for the brand's own dashboard —
 * the same seven metrics it sees on the analytics page. "Save as PDF" is
 * the export.
 */

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import ValueProofReportPage from '@/components/value-proof/ValueProofReportPage';
import { useDashboardLang } from '@/hooks/useDashboardLang';

export default function BrandValueProofReport({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const days = useSearchParams().get('days') || '30';
  const { lang } = useDashboardLang(username);
  return (
    <ValueProofReportPage
      endpoint={`/api/influencer/${encodeURIComponent(username)}/analytics/value-proof?days=${encodeURIComponent(days)}`}
      audience="brand"
      language={lang === 'en' ? 'en' : 'he'}
    />
  );
}
