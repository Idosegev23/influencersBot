import { describe, it, expect } from 'vitest';
import { computeScanProgress, SCAN_STEPS } from '@/lib/pipeline/progress';
import { STEP_ORDER } from '@/lib/pipeline/types';

describe('computeScanProgress', () => {
  it('counts distinct completed steps and derives percent + currentStep', () => {
    const logs = [
      { step: 'create-account', status: 'completed', timestamp: '2026-07-08T10:00:00Z' },
      { step: 'ig-scan', status: 'completed', timestamp: '2026-07-08T10:01:00Z' },
      { step: 'transcribe', status: 'running', timestamp: '2026-07-08T10:02:00Z' },
    ];
    const p = computeScanProgress({ status: 'running', step_logs: logs, created_at: '2026-07-08T10:00:00Z' }, Date.parse('2026-07-08T10:03:00Z'));
    expect(p.totalSteps).toBe(SCAN_STEPS.length);
    expect(p.completedSteps).toBe(2);
    expect(p.percent).toBe(Math.round((2 / SCAN_STEPS.length) * 100));
    expect(p.currentStep).toBe('transcribe'); // running, no completed after
    expect(p.elapsedMs).toBe(180000);
    expect(p.lastUpdateMs).toBe(60000); // now - last log ts
  });
  it('empty logs → 0% at create-account', () => {
    const p = computeScanProgress({ status: 'queued', step_logs: [], created_at: '2026-07-08T10:00:00Z' }, Date.parse('2026-07-08T10:00:05Z'));
    expect(p.percent).toBe(0);
    expect(p.currentStep).toBe('create-account');
  });
  it('exposes SCAN_STEPS as the ordered pipeline steps', () => {
    // Derived, not counted: this list grew from 9 to 15 steps and a hard-coded length
    // went stale four times. It must simply never drift from the executable order.
    expect([...SCAN_STEPS]).toEqual(STEP_ORDER);
    expect(SCAN_STEPS).toContain('x-scan');
    expect(SCAN_STEPS[0]).toBe('create-account');
    expect(SCAN_STEPS[SCAN_STEPS.length - 1]).toBe('finalize');
  });
});
