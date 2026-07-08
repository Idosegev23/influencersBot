'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// One row from GET /api/admin/scans (shape mirrors that route's response).
interface ScanRow {
  jobId: string;
  accountId: string | null;
  name: string;
  username: string | null;
  status: string;
  currentStep: string | null;
  percent: number;
  completedSteps: number;
  totalSteps: number;
  elapsedMs: number;
  lastUpdateMs: number;
  error: string | null;
}

// Hebrew labels for the 9 pipeline steps (mirrors StepBoard's STEP_LABELS).
const STEP_LABELS: Record<string, string> = {
  'create-account': 'יצירת חשבון', 'ig-scan': 'סריקת אינסטגרם', 'transcribe': 'תמלול וידאו',
  'site-discover': 'איתור עמודי אתר', 'site-crawl': 'סריקת אתר', 'rag-ingest': 'אינדוקס RAG',
  'product-extract': 'חילוץ מוצרים', 'persona-build': 'בניית פרסונה', 'finalize': 'סיום והגדרות',
};

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  queued: { label: 'בתור', bg: '#f3f4f6', color: '#6b7280' },
  running: { label: 'רץ', bg: '#EEF2FF', color: '#2663EB' },
  succeeded: { label: 'הושלם', bg: '#DCFCE8', color: '#16a34a' },
  failed: { label: 'נכשל', bg: 'rgba(239,68,68,0.08)', color: '#ef4444' },
};

const ACTIVE = new Set(['queued', 'running']);
const STUCK_MS = 180000;

// mm:ss for total elapsed time.
function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// "N שנ׳" under a minute, otherwise "N דק׳".
function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} שנ׳`;
  return `${Math.floor(s / 60)} דק׳`;
}

export default function ScansDashboard() {
  const [scans, setScans] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/scans');
        const j = await r.json();
        if (!alive) return;
        if (r.ok && Array.isArray(j.scans)) {
          setScans(j.scans);
          setError(null);
        } else {
          setError(j?.error || 'שגיאה בטעינת הסריקות');
        }
      } catch {
        if (alive) setError('שגיאת רשת');
      } finally {
        // Keep polling every 2.5s while mounted so new scans appear and
        // active ones advance. lastUpdateMs/elapsedMs come fresh each poll.
        if (alive) setTimeout(tick, 2500);
      }
    };
    tick();
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <div className="neon-card p-5 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: '#1f2937' }}>
            סריקות
          </h1>
          <Link
            href="/admin/add"
            className="neon-pill neon-pill-primary px-4 py-2 text-sm font-bold flex items-center gap-1 shrink-0"
          >
            <span>➕</span>
            <span>הוסף חשבון</span>
          </Link>
        </div>

        {error && (
          <div
            className="text-sm p-3 rounded-xl mb-4"
            style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}
          >
            {error}
          </div>
        )}

        {scans === null && !error && (
          <div className="py-16 text-center text-sm" style={{ color: '#6b7280' }}>טוען…</div>
        )}

        {scans !== null && scans.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: '#6b7280' }}>אין סריקות עדיין</div>
        )}

        {scans !== null && scans.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
            {scans.map((scan, i) => {
              const meta = STATUS_META[scan.status] ?? { label: scan.status, bg: '#f3f4f6', color: '#6b7280' };
              const stepLabel = scan.currentStep ? (STEP_LABELS[scan.currentStep] ?? scan.currentStep) : '';
              const isActive = ACTIVE.has(scan.status);
              const maybeStuck = scan.status === 'running' && scan.lastUpdateMs > STUCK_MS;
              return (
                <Link
                  key={scan.jobId}
                  href={`/admin/scan/${scan.jobId}`}
                  className="block p-4 transition-colors hover:bg-black/[0.02]"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-bold truncate" style={{ color: '#1f2937' }}>{scan.name}</span>
                      {maybeStuck && (
                        <span className="text-xs shrink-0" style={{ color: '#d97706' }} title="לא עודכן מעל 3 דקות">
                          ⚠ ייתכן שנתקע
                        </span>
                      )}
                    </div>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${scan.percent}%`,
                          background: scan.status === 'failed' ? '#ef4444' : scan.status === 'succeeded' ? '#16a34a' : '#2663EB',
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold shrink-0 tabular-nums" style={{ color: '#6b7280' }}>
                      {scan.percent}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs" style={{ color: '#9ca3af' }}>
                    <span className="truncate">
                      {isActive && stepLabel ? stepLabel : `${scan.completedSteps}/${scan.totalSteps} שלבים`}
                    </span>
                    <span className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span>{fmtElapsed(scan.elapsedMs)}</span>
                      <span>עודכן לפני {fmtAgo(scan.lastUpdateMs)}</span>
                      <span aria-hidden style={{ color: '#c4b5fd' }}>→</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
