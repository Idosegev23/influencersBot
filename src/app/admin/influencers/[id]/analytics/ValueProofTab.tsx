'use client';

/**
 * Admin "הוכחת ערך" tab — all 10 metrics for one account.
 *
 * Rendering lives in the shared ValueProofView so the admin tab, the brand
 * dashboard block and the printable export can never disagree about a number.
 */

import { useEffect, useState } from 'react';
import ValueProofView, { type ValueProofData } from '@/components/value-proof/ValueProofView';
import '@/components/value-proof/value-proof.css';

export default function ValueProofTab({ accountId, days }: { accountId: string; days: number }) {
  const [data, setData] = useState<ValueProofData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/admin/analytics/value-proof?accountId=${accountId}&days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) setFailed(true);
        else setData(d);
        setLoading(false);
      })
      .catch(() => { if (alive) { setFailed(true); setLoading(false); } });
    return () => { alive = false; };
  }, [accountId, days]);

  if (loading) return <div className="p-6 text-sm text-neutral-500">טוען…</div>;
  if (failed || !data) return <div className="p-6 text-sm text-red-600">שגיאה בטעינת המדדים</div>;

  return (
    <div className="p-4">
      <div className="vp-no-print mb-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-neutral-500 max-w-2xl leading-relaxed" dir="rtl">
          מדד בלי מקור נתונים מוצג כ״לא נמדד״ עם הסיבה — לעולם לא כאפס. אחוז שמבוסס על פחות מ-30
          מקרים מסומן כמדגם קטן.
        </p>
        <a
          href={`/admin/influencers/${accountId}/value-proof-report?days=${days}`}
          target="_blank"
          rel="noopener"
          className="text-xs rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 whitespace-nowrap"
        >
          ייצוא דוח ממותג ↗
        </a>
      </div>
      <ValueProofView data={data} audience="admin" />
    </div>
  );
}
