'use client';

/**
 * Brand-facing value proof, inside the existing analytics page. Seven of the ten
 * metrics — accuracy, setup time and the brand's own usage are internal product
 * metrics and are filtered server-side, not hidden here.
 */

import { useEffect, useState } from 'react';
import ValueProofView, { type ValueProofData } from '@/components/value-proof/ValueProofView';
import '@/components/value-proof/value-proof.css';

export default function ValueProofBlock({ username, days }: { username: string; days: number }) {
  const [data, setData] = useState<ValueProofData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetch(`/api/influencer/${encodeURIComponent(username)}/analytics/value-proof?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) setState('failed');
        else { setData(d); setState('ready'); }
      })
      .catch(() => { if (alive) setState('failed'); });
    return () => { alive = false; };
  }, [username, days]);

  // A failed load stays silent rather than putting an error card in the middle
  // of the brand's dashboard — the rest of the page is unaffected.
  if (state === 'failed') return null;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3" dir="rtl">
        <h2 className="text-base font-semibold">הוכחת ערך</h2>
        <a
          href={`/influencer/${encodeURIComponent(username)}/analytics/report?days=${days}`}
          target="_blank"
          rel="noopener"
          className="text-xs rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5 whitespace-nowrap"
        >
          ייצוא דוח ↗
        </a>
      </div>
      {state === 'loading'
        ? <div className="text-sm opacity-60" dir="rtl">טוען…</div>
        : data ? <ValueProofView data={data} audience="brand" /> : null}
    </section>
  );
}
