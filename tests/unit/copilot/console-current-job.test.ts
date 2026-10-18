// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ getByAccount: async () => [] }) }));
import { pickCurrentJob, scanSummary } from '@/lib/copilot/console-data';

const NOW = Date.parse('2026-10-18T20:00:00Z');
const at = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe('pickCurrentJob', () => {
  it('skips an orphaned queued job and a cancelled one, reporting the last real scan', () => {
    const jobs = [
      { id: 'orphan', status: 'queued', updated_at: at(60 * 24 * 49) },
      { id: 'cancelled', status: 'cancelled', updated_at: at(60 * 24 * 50) },
      { id: 'done', status: 'succeeded', updated_at: at(60 * 24 * 51) },
    ];
    expect(pickCurrentJob(jobs, NOW)?.id).toBe('done');
    expect(scanSummary(pickCurrentJob(jobs, NOW), NOW).status).toBe('ready');
  });
  it('keeps a live running job', () => {
    const jobs = [{ id: 'live', status: 'running', updated_at: at(5) }, { id: 'done', status: 'succeeded', updated_at: at(600) }];
    expect(pickCurrentJob(jobs, NOW)?.id).toBe('live');
    expect(scanSummary(pickCurrentJob(jobs, NOW), NOW).status).toBe('scanning');
  });
  it('keeps a failed job (a real failure is shown)', () => {
    expect(pickCurrentJob([{ id: 'f', status: 'failed', updated_at: at(10) }], NOW)?.id).toBe('f');
  });
  it('returns null when only skipped jobs exist', () => {
    expect(pickCurrentJob([{ id: 'c', status: 'cancelled', updated_at: at(1) }], NOW)).toBeNull();
    expect(pickCurrentJob([], NOW)).toBeNull();
  });
});
