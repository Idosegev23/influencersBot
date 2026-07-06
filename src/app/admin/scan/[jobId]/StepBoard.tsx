'use client';
import { useEffect, useState } from 'react';

const STEP_LABELS: Record<string, string> = {
  'create-account': 'יצירת חשבון', 'ig-scan': 'סריקת אינסטגרם', 'transcribe': 'תמלול וידאו',
  'site-discover': 'איתור עמודי אתר', 'site-crawl': 'סריקת אתר', 'rag-ingest': 'אינדוקס RAG',
  'product-extract': 'חילוץ מוצרים', 'persona-build': 'בניית פרסונה', 'finalize': 'סיום והגדרות',
};
const ORDER = Object.keys(STEP_LABELS);

export default function StepBoard({ jobId }: { jobId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/pipeline/status/${jobId}`); const j = await r.json();
      if (alive) setData(j);
      if (alive && j.status !== 'succeeded' && j.status !== 'failed') setTimeout(tick, 2500);
    };
    tick(); return () => { alive = false; };
  }, [jobId]);
  if (!data) return <div>טוען…</div>;
  const latest = (step: string) => [...(data.steps ?? [])].reverse().find((s: any) => s.step === step);
  return (
    <div dir="rtl">
      <h1>סטטוס סריקה — {data.status}</h1>
      {ORDER.map(step => {
        const log = latest(step); const c = data.counts?.[step === 'site-crawl' ? 'crawl' : step];
        const status = log?.status ?? 'pending';
        return (
          <div key={step} style={{ display: 'flex', gap: 8, padding: 8 }}>
            <span>{status === 'completed' ? '✓' : status === 'running' ? '⏳' : status === 'failed' ? '✗' : '•'}</span>
            <span>{STEP_LABELS[step]}</span>
            {c && <span>{c.done}/{c.total}</span>}
            {status === 'failed' && <span style={{ color: 'red' }}>{log?.message}</span>}
          </div>
        );
      })}
    </div>
  );
}
