// tests/unit/pipeline/ig-scan-step.test.ts
import { describe, it, expect, vi } from 'vitest';
const runScanJob = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/scraping/runScanJob', () => ({ runScanJob }));
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: { website_url: 'https://carolinalemke.co.il' } } }) }) }) }) }) }));
describe('igScanStep', () => {
  it('runs the scan and advances', async () => {
    const { igScanStep } = await import('@/lib/pipeline/steps/ig-scan');
    const res = await igScanStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'ig-scan', batch: 0, state: { currentStep: 'ig-scan', counts: {}, cursors: {}, options: { transcribe: true, maxPages: null, postsLimit: 50, isDemo: true } } as any });
    expect(runScanJob).toHaveBeenCalledWith('j1');
    expect(res.status).toBe('advance');
  });
});
