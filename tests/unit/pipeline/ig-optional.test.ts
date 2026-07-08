// tests/unit/pipeline/ig-optional.test.ts
import { describe, it, expect, vi } from 'vitest';
const runScanJob = vi.fn();
vi.mock('@/lib/scraping/runScanJob', () => ({ runScanJob }));
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn(), setCount: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }) }) }) }));
describe('ig-scan skip when website-only', () => {
  it('advances without running the scan when username == domain', async () => {
    const { igScanStep } = await import('@/lib/pipeline/steps/ig-scan');
    const res = await igScanStep({ jobId: 'j', accountId: 'a', username: 's.com', step: 'ig-scan', batch: 0, state: { websiteUrl: 'https://s.com', options: {} } as any });
    expect(runScanJob).not.toHaveBeenCalled();
    expect(res.status).toBe('advance');
  });
});
