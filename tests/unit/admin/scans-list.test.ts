import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));

// Two jobs, returned by the query in created_at DESC order:
// the succeeded job is newer (would be first by date), the running job is older.
// Active-first sorting must still float the running job to the top.
const scanJobsData = [
  {
    id: 'job-a',
    username: 'brandA',
    account_id: 'acc-a',
    status: 'succeeded',
    step_logs: [
      { step: 'create-account', status: 'completed', progress: 100, message: '', timestamp: '2026-07-08T10:05:10Z' },
      { step: 'ig-scan', status: 'completed', progress: 100, message: '', timestamp: '2026-07-08T10:05:20Z' },
      { step: 'finalize', status: 'completed', progress: 100, message: '', timestamp: '2026-07-08T10:06:00Z' },
    ],
    created_at: '2026-07-08T10:05:00Z',
    finished_at: '2026-07-08T10:06:00Z',
    error_message: null,
  },
  {
    id: 'job-b',
    username: 'brandB',
    account_id: 'acc-b',
    status: 'running',
    step_logs: [
      { step: 'create-account', status: 'completed', progress: 100, message: '', timestamp: '2026-07-08T10:00:10Z' },
      { step: 'ig-scan', status: 'running', progress: 30, message: '', timestamp: '2026-07-08T10:00:30Z' },
    ],
    created_at: '2026-07-08T10:00:00Z',
    finished_at: null,
    error_message: null,
  },
];

const accountsData = [
  { id: 'acc-a', config: { display_name: 'Brand A Ltd' } },
  { id: 'acc-b', config: { display_name: 'Brand B Ltd' } },
];

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'scan_jobs') {
        return {
          select: () => ({
            order: () => ({
              limit: async () => ({ data: scanJobsData, error: null }),
            }),
          }),
        };
      }
      // accounts
      return {
        select: () => ({
          in: async () => ({ data: accountsData, error: null }),
        }),
      };
    },
  }),
}));

describe('GET /api/admin/scans', () => {
  it('returns progress-mapped scans, active-first, with resolved names', async () => {
    const { GET } = await import('@/app/api/admin/scans/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.scans)).toBe(true);
    expect(body.scans).toHaveLength(2);

    // active-first: the running job floats above the newer succeeded job
    expect(body.scans[0].jobId).toBe('job-b');
    expect(body.scans[0].status).toBe('running');
    expect(body.scans[1].status).toBe('succeeded');

    // progress fields present
    expect(typeof body.scans[0].percent).toBe('number');
    expect(typeof body.scans[0].completedSteps).toBe('number');
    expect(body.scans[0].totalSteps).toBe(9);
    expect(body.scans[0].currentStep).toBe('ig-scan');
    expect(typeof body.scans[0].elapsedMs).toBe('number');
    expect(typeof body.scans[0].lastUpdateMs).toBe('number');

    // name resolved from account config->>display_name; username preserved
    expect(body.scans[0].name).toBe('Brand B Ltd');
    expect(body.scans[0].username).toBe('brandB');
    expect(body.scans[0].accountId).toBe('acc-b');
    expect(body.scans[0].error).toBe(null);
  });
});
