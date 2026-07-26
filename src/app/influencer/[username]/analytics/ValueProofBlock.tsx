'use client';

/**
 * Brand-facing value proof, inside the existing analytics page. Seven of the ten
 * metrics — accuracy, setup time and the brand's own usage are internal product
 * metrics and are filtered server-side, not hidden here.
 */

import { useEffect, useState } from 'react';
import ValueProofView, { type ValueProofData } from '@/components/value-proof/ValueProofView';
import CostPerTicketPrompt from './CostPerTicketPrompt';
import '@/components/value-proof/value-proof.css';

export default function ValueProofBlock({ username, days }: { username: string; days: number }) {
  const [data, setData] = useState<ValueProofData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // Bumped after the brand saves a cost per ticket, so the shekel metric flips
  // from "not measured" to a number without a page reload.
  const [reload, setReload] = useState(0);

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
  }, [username, days, reload]);

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
        : data ? (
          <>
            <ValueProofView data={data} audience="brand" />
            {/* Shown only when deflection itself is measurable — otherwise the
                shekel figure has no count to multiply and the prompt is noise. */}
            {data.deflection.rate.measured && (
              <CostPerTicketPrompt
                username={username}
                // value_ils = deflected × cost, and its n IS the deflected count,
                // so dividing recovers the cost the brand entered.
                current={data.deflection.value_ils.measured && data.deflection.value_ils.n > 0
                  ? Math.round(((data.deflection.value_ils.value as number) / data.deflection.value_ils.n) * 100) / 100
                  : null}
                onSaved={() => setReload((r) => r + 1)}
              />
            )}
          </>
        ) : null}
    </section>
  );
}
