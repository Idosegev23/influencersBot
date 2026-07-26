'use client';

/**
 * Branded, printable value-proof report for one account (admin view — all 10
 * metrics). Opened from the "הוכחת ערך" analytics tab; "Save as PDF" in the
 * browser is the export.
 */

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import ValueProofReportPage from '@/components/value-proof/ValueProofReportPage';

export default function AdminValueProofReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const days = useSearchParams().get('days') || '30';
  return (
    <ValueProofReportPage
      endpoint={`/api/admin/analytics/value-proof?accountId=${encodeURIComponent(id)}&days=${encodeURIComponent(days)}`}
      audience="admin"
    />
  );
}
