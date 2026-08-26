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
import { getDashboardStrings } from '@/lib/i18n/dashboard';

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Report dates. Hebrew keeps its hand-written month names; English defers to Intl. */
function reportDate(iso: string | undefined, isEn: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isEn) {
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return `${d.getDate()} ב${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ValueProofReportPage({
  endpoint,
  audience,
  language,
}: {
  endpoint: string;
  audience: 'admin' | 'brand';
  /** Account language. Defaults to Hebrew — the admin-side report is internal. */
  language?: 'he' | 'en';
}) {
  const isEn = language === 'en';
  const T = getDashboardStrings(isEn ? 'en' : 'he').valueProof;
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

  if (state === 'loading') return <div className="vp-page"><p>{T.reportLoading}</p></div>;
  if (state === 'failed' || !data) return <div className="vp-page"><p>{T.reportError}</p></div>;

  const brand = data.brand || {};
  const accent = brand.primaryColor || '#0c1013';

  return (
    <div className="vp-page" dir={isEn ? 'ltr' : 'rtl'} style={{ ['--vp-accent' as any]: accent }}>
      <header className="vp-report-head">
        <div className="vp-report-brand">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt="" className="vp-report-logo" />
          ) : null}
          <div>
            <h1 className="vp-report-title">{T.reportTitle}</h1>
            <p className="vp-report-sub">
              {brand.name || brand.username || ''}
              {data.window?.since ? ` · ${reportDate(data.window.since, isEn)} — ${reportDate(data.window.until, isEn)}` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="vp-print-btn vp-no-print" onClick={() => window.print()}>
          {T.savePdf}
        </button>
      </header>

      <p className="vp-report-method">
        {T.reportFooterNote}
      </p>

      <ValueProofView data={data} audience={audience} language={isEn ? 'en' : 'he'} />

      <footer className="vp-report-foot">
        {T.generatedBy} · {reportDate(new Date().toISOString(), isEn)}
      </footer>
    </div>
  );
}
