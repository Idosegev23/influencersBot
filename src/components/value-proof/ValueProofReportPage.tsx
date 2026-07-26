'use client';

/**
 * The printable, branded value-proof report. One component, two entry points
 * (admin and brand dashboard), because the brand must be able to read exactly
 * what we read.
 *
 * Print is the export: "Save as PDF" in the browser produces a clean A4 document
 * — no PDF dependency, no server-side rendering pipeline, and the layout is the
 * same one already validated on screen.
 */

import { useEffect, useState } from 'react';
import ValueProofView, { type ValueProofData } from './ValueProofView';
import './value-proof.css';

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
function heDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ב${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ValueProofReportPage({
  endpoint,
  audience,
}: {
  endpoint: string;
  audience: 'admin' | 'brand';
}) {
  const [data, setData] = useState<ValueProofData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let alive = true;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) setState('failed');
        else { setData(d); setState('ready'); }
      })
      .catch(() => { if (alive) setState('failed'); });
    return () => { alive = false; };
  }, [endpoint]);

  if (state === 'loading') return <div className="vp-page"><p>טוען…</p></div>;
  if (state === 'failed' || !data) return <div className="vp-page"><p>שגיאה בטעינת הדוח</p></div>;

  const brand = data.brand || {};
  const accent = brand.primaryColor || '#0c1013';

  return (
    <div className="vp-page" dir="rtl" style={{ ['--vp-accent' as any]: accent }}>
      <header className="vp-report-head">
        <div className="vp-report-brand">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt="" className="vp-report-logo" />
          ) : null}
          <div>
            <h1 className="vp-report-title">הוכחת ערך</h1>
            <p className="vp-report-sub">
              {brand.name || brand.username || ''}
              {data.window?.since ? ` · ${heDate(data.window.since)} — ${heDate(data.window.until)}` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="vp-print-btn vp-no-print" onClick={() => window.print()}>
          שמירה כ-PDF
        </button>
      </header>

      <p className="vp-report-method">
        כל מספר בדוח מחושב מנתוני האמת של החנות והשיחות. מדד שאין לו מקור נתונים מוצג
        כ״לא נמדד״ יחד עם הסיבה — ולא כאפס. אחוז שנשען על פחות מ-30 מקרים מסומן כמדגם קטן.
      </p>

      <ValueProofView data={data} audience={audience} />

      <footer className="vp-report-foot">
        הופק על ידי Bestie · {heDate(new Date().toISOString())}
      </footer>
    </div>
  );
}
