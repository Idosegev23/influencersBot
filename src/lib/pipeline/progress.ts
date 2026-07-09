export const SCAN_STEPS = [
  'create-account', 'ig-scan', 'transcribe', 'youtube-scan', 'tiktok-scan', 'site-discover', 'site-crawl',
  'rag-ingest', 'product-extract', 'persona-build', 'finalize',
];

export interface StepLog { step: string; status: string; progress?: number; message?: string; timestamp: string }
export interface ScanProgress { completedSteps: number; totalSteps: number; percent: number; currentStep: string | null; elapsedMs: number; lastUpdateMs: number }

export function computeScanProgress(
  input: { status: string; step_logs?: StepLog[]; created_at?: string; finished_at?: string | null },
  now: number = Date.now(),
): ScanProgress {
  const logs = input.step_logs ?? [];
  const completed = new Set(logs.filter(l => l.status === 'completed').map(l => l.step));
  const completedSteps = SCAN_STEPS.filter(s => completed.has(s)).length;
  const percent = Math.round((completedSteps / SCAN_STEPS.length) * 100);

  // currentStep: latest running log whose step has no LATER completed; else last log's step; else first step.
  // ("no later completed" — not "never completed" — so retrying an already-completed step is tracked correctly.)
  const lastCompletedAt = new Map<string, number>();
  for (const l of logs) {
    if (l.status === 'completed') {
      const t = Date.parse(l.timestamp);
      if (t > (lastCompletedAt.get(l.step) ?? -Infinity)) lastCompletedAt.set(l.step, t);
    }
  }
  let currentStep: string | null = null;
  const sorted = [...logs].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const l = sorted[i];
    const completedAfter = (lastCompletedAt.get(l.step) ?? -Infinity) > Date.parse(l.timestamp);
    if (l.status === 'running' && !completedAfter) { currentStep = l.step; break; }
  }
  if (!currentStep) currentStep = sorted.length ? sorted[sorted.length - 1].step : SCAN_STEPS[0];

  const createdMs = input.created_at ? Date.parse(input.created_at) : now;
  const endMs = input.finished_at ? Date.parse(input.finished_at) : now;
  const lastTs = sorted.length ? Date.parse(sorted[sorted.length - 1].timestamp) : createdMs;
  return {
    completedSteps, totalSteps: SCAN_STEPS.length, percent, currentStep,
    elapsedMs: Math.max(0, endMs - createdMs),
    lastUpdateMs: Math.max(0, now - lastTs),
  };
}
