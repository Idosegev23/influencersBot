'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SCAN_STEPS } from '@/lib/pipeline/progress';
import { useScanNotifications } from '@/components/admin/useScanNotifications';

// Hebrew labels for the 9 pipeline steps (mirrors ScansDashboard's STEP_LABELS).
const STEP_LABELS: Record<string, string> = {
  'create-account': 'יצירת חשבון', 'ig-scan': 'סריקת אינסטגרם', 'transcribe': 'תמלול וידאו',
  'youtube-scan': 'סריקת יוטיוב', 'tiktok-scan': 'סריקת טיקטוק',
  'site-discover': 'איתור עמודי אתר', 'site-crawl': 'סריקת אתר', 'rag-ingest': 'אינדוקס RAG',
  'product-extract': 'חילוץ מוצרים', 'persona-build': 'בניית פרסונה', 'finalize': 'סיום והגדרות',
};

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  queued: { label: 'בתור', bg: '#f3f4f6', color: '#6b7280' },
  running: { label: 'רץ', bg: '#EEF2FF', color: '#2663EB' },
  succeeded: { label: 'הושלם', bg: '#DCFCE8', color: '#16a34a' },
  failed: { label: 'נכשל', bg: 'rgba(239,68,68,0.08)', color: '#ef4444' },
  cancelled: { label: 'בוטל', bg: '#f3f4f6', color: '#6b7280' },
};

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const STUCK_MS = 180000;

// Shape of GET /api/pipeline/status/[jobId] (extended in Task 2 with progress fields).
interface StatusData {
  status: string;
  steps: { step: string; status: string; message?: string; timestamp?: string }[];
  counts: Record<string, { done?: number; total?: number }>;
  error: string | null;
  percent: number;
  currentStep: string | null;
  completedSteps: number;
  totalSteps: number;
  elapsedMs: number;
  lastUpdateMs: number;
}

// Account metadata resolved once from GET /api/admin/scans (for the header + success links).
interface ScanMeta { name: string; username: string | null; accountId: string | null }

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

// Latest log entry for a step (step_logs are append-only, so the last match wins).
function latestLog(steps: StatusData['steps'], step: string) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].step === step) return steps[i];
  }
  return undefined;
}

export default function StepBoard({ jobId }: { jobId: string }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // Wall-clock ms when the last poll landed — lets us tick elapsed/heartbeat
  // smoothly between the 2.5s polls instead of freezing.
  const polledAtRef = useRef<number>(Date.now());
  const [, setTick] = useState(0);
  const { notify, Toasts } = useScanNotifications();
  // Previous poll's status — used to fire a notification exactly on the terminal flip.
  const prevStatusRef = useRef<string | null>(null);

  // Poll the live status route. Restarts when retryNonce bumps (after a retry).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pipeline/status/${jobId}`);
        const j = await r.json();
        if (!alive) return;
        polledAtRef.current = Date.now();
        setData(j);
        if (!TERMINAL.has(j.status)) setTimeout(tick, 2500);
      } catch {
        if (alive) setTimeout(tick, 2500);
      }
    };
    tick();
    return () => { alive = false; };
  }, [jobId, retryNonce]);

  // Resolve account name/username/accountId once (best-effort) from the scans list.
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/scans')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j || !Array.isArray(j.scans)) return;
        const row = j.scans.find((s: any) => s.jobId === jobId);
        if (row) setMeta({ name: row.name, username: row.username, accountId: row.accountId });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [jobId]);

  // 1s local ticker so elapsed + "עודכן לפני" keep moving between polls (frozen once terminal).
  useEffect(() => {
    if (data && TERMINAL.has(data.status)) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data]);

  // Notify once when the scan flips to a terminal state during polling. The first
  // poll seeds prevStatusRef (null → skip), so an already-finished scan opened
  // fresh does not spuriously notify.
  useEffect(() => {
    if (!data) return;
    const prev = prevStatusRef.current;
    const cur = data.status;
    if (prev && prev !== cur) {
      const name = meta?.name || meta?.username || jobId;
      if (cur === 'succeeded') notify('הסריקה הושלמה', name);
      else if (cur === 'failed') notify('הסריקה נכשלה', name);
    }
    prevStatusRef.current = cur;
  }, [data, meta, jobId, notify]);

  async function handleRetry(step: string) {
    setRetrying(true);
    try {
      await fetch('/api/pipeline/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, step }),
      });
      setRetryNonce((n) => n + 1); // resume polling
    } catch {
      /* leave the button enabled so the admin can try again */
    } finally {
      setRetrying(false);
    }
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto" dir="rtl">
        <div className="neon-card p-8 text-center text-sm" style={{ color: '#6b7280' }}>טוען…</div>
      </div>
    );
  }

  const statusMeta = STATUS_META[data.status] ?? { label: data.status, bg: '#f3f4f6', color: '#6b7280' };
  const isTerminal = TERMINAL.has(data.status);
  const sinceLastPoll = isTerminal ? 0 : Date.now() - polledAtRef.current;
  const elapsedMs = data.elapsedMs + sinceLastPoll;
  const agoMs = data.lastUpdateMs + sinceLastPoll;
  const maybeStuck = data.status === 'running' && agoMs > STUCK_MS;

  // The failed step (its latest log is 'failed') powers the retry button.
  const failedStep = data.status === 'failed'
    ? SCAN_STEPS.find((s) => latestLog(data.steps, s)?.status === 'failed') ?? data.currentStep
    : null;
  const title = meta?.name || meta?.username || jobId;

  return (
    <>
      {Toasts}
      <div className="max-w-2xl mx-auto" dir="rtl">
      <div className="neon-card p-5 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0 flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight truncate" style={{ color: '#1f2937' }}>
              {title}
            </h1>
            {maybeStuck && (
              <span className="text-xs shrink-0" style={{ color: '#d97706' }} title="לא עודכן מעל 3 דקות">
                ⚠ ייתכן שנתקע
              </span>
            )}
          </div>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: statusMeta.bg, color: statusMeta.color }}
          >
            {statusMeta.label}
          </span>
        </div>

        {/* Overall progress */}
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${data.percent}%`,
                background: data.status === 'failed' ? '#ef4444' : data.status === 'succeeded' ? '#16a34a' : '#2663EB',
              }}
            />
          </div>
          <span className="text-xs font-semibold shrink-0 tabular-nums" style={{ color: '#6b7280' }}>
            {data.percent}% · {data.completedSteps}/{data.totalSteps}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs mb-6 tabular-nums" style={{ color: '#9ca3af' }}>
          <span>זמן כולל {fmtElapsed(elapsedMs)}</span>
          {!isTerminal && <span>עודכן לפני {fmtAgo(agoMs)}</span>}
        </div>

        {/* Step rows */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
          {SCAN_STEPS.map((step, i) => {
            const log = latestLog(data.steps, step);
            const st = log?.status ?? 'pending';
            const count = data.counts?.[step === 'site-crawl' ? 'crawl' : step];
            const isCurrent = !isTerminal && data.currentStep === step && st !== 'completed';
            return (
              <div
                key={step}
                className="flex items-center gap-3 p-3"
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                  background: isCurrent ? '#EEF2FF' : 'transparent',
                }}
              >
                <span className="shrink-0 w-5 flex items-center justify-center">
                  {st === 'completed' ? (
                    <span style={{ color: '#16a34a' }}>✓</span>
                  ) : st === 'failed' ? (
                    <span style={{ color: '#ef4444' }}>✗</span>
                  ) : st === 'running' ? (
                    <span
                      className="w-4 h-4 border-2 rounded-full animate-spin inline-block"
                      style={{ borderColor: '#2663EB', borderTopColor: 'transparent' }}
                    />
                  ) : (
                    <span style={{ color: '#d1d5db' }}>•</span>
                  )}
                </span>
                <span
                  className="flex-1 truncate text-sm"
                  style={{ color: st === 'pending' ? '#9ca3af' : '#1f2937', fontWeight: isCurrent ? 700 : 500 }}
                >
                  {STEP_LABELS[step]}
                </span>
                {count && (count.total ?? 0) > 0 && (
                  <span className="text-xs shrink-0 tabular-nums" style={{ color: '#6b7280' }}>
                    {count.done ?? 0}/{count.total}
                  </span>
                )}
                {st === 'failed' && log?.message && (
                  <span className="text-xs shrink-0 truncate max-w-[45%]" style={{ color: '#ef4444' }} title={log.message}>
                    {log.message}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Success banner + links */}
        {data.status === 'succeeded' && (
          <div className="mt-6 p-4 rounded-xl" style={{ background: '#DCFCE8' }}>
            <div className="font-bold mb-3" style={{ color: '#16a34a' }}>✅ הסריקה הושלמה בהצלחה</div>
            <div className="flex flex-wrap gap-2">
              {meta?.username && (
                <Link href={`/chat/${meta.username}`} className="neon-pill px-4 py-2 text-sm font-semibold" style={{ color: '#2663EB', border: '1px solid #2663EB' }}>
                  💬 לצ׳אט
                </Link>
              )}
              {meta?.accountId && (
                <Link href={`/install?id=${meta.accountId}&name=${encodeURIComponent(meta.name || '')}`} className="neon-pill px-4 py-2 text-sm font-semibold" style={{ color: '#9334EB', border: '1px solid #9334EB' }}>
                  🔌 התקנה באתר
                </Link>
              )}
              {meta?.accountId && (
                <Link href={`/admin/influencers/${meta.accountId}`} className="neon-pill px-4 py-2 text-sm font-semibold" style={{ color: '#6b7280', border: '1px solid #d1d5db' }}>
                  ⚙️ עמוד החשבון
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Failure banner + retry */}
        {data.status === 'failed' && (
          <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="font-bold mb-1" style={{ color: '#ef4444' }}>
              ✗ הסריקה נכשלה{failedStep ? ` בשלב "${STEP_LABELS[failedStep] ?? failedStep}"` : ''}
            </div>
            {data.error && <div className="text-sm mb-3" style={{ color: '#b91c1c' }}>{data.error}</div>}
            {failedStep && (
              <button
                type="button"
                onClick={() => handleRetry(failedStep)}
                disabled={retrying}
                className="neon-pill neon-pill-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {retrying ? 'מנסה שוב…' : 'נסה שוב'}
              </button>
            )}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/admin/scans" className="text-sm font-semibold" style={{ color: '#9334EB' }}>
            צפה בכל הסריקות ←
          </Link>
        </div>
      </div>
      </div>
    </>
  );
}
