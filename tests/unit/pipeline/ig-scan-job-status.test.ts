import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `runScanJob` owns the scan_jobs row in the LEGACY path (cron, /api/scan/start, scripts):
 * it marks running → succeeded/failed around the Instagram orchestrator.
 *
 * The QStash pipeline reuses the same helper for its `ig-scan` step, against the SAME job
 * row — so that ownership marked every pipeline job `succeeded` with six steps still to go,
 * and, on a QStash retry, the `status !== 'queued'` guard silently skipped the scan while
 * the pipeline advanced with no Instagram data.
 *
 * `manageJobStatus: false` hands lifecycle control to the caller.
 */

const repo = {
  getById: vi.fn(),
  markRunning: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
};
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => repo }));

const run = vi.fn();
vi.mock('@/lib/scraping/newScanOrchestrator', () => ({
  NewScanOrchestrator: class {
    run = run;
  },
}));

const JOB = { id: 'j1', username: 'terminalx', account_id: 'acc1', status: 'queued', config: {} };

beforeEach(() => {
  vi.clearAllMocks();
  repo.getById.mockResolvedValue({ ...JOB });
  run.mockResolvedValue({ posts: 30 });
});

describe('runScanJob — legacy ownership (default)', () => {
  it('marks running then succeeded around the orchestrator', async () => {
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await runScanJob('j1');
    expect(repo.markRunning).toHaveBeenCalledWith('j1', 'api-worker');
    expect(repo.markSucceeded).toHaveBeenCalledWith('j1', { posts: 30 });
    expect(run).toHaveBeenCalledOnce();
  });

  it('marks failed and rethrows when the orchestrator throws', async () => {
    run.mockRejectedValue(Object.assign(new Error('scrape died'), { code: 'SCRAPE_ERR' }));
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await expect(runScanJob('j1')).rejects.toThrow('scrape died');
    expect(repo.markFailed).toHaveBeenCalledWith('j1', 'SCRAPE_ERR', 'scrape died');
  });

  it('skips a job that is no longer queued', async () => {
    repo.getById.mockResolvedValue({ ...JOB, status: 'running' });
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await runScanJob('j1');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('runScanJob — pipeline mode (manageJobStatus: false)', () => {
  it('never marks the job succeeded — the pipeline still has six steps to run', async () => {
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await runScanJob('j1', { manageJobStatus: false });
    expect(run).toHaveBeenCalledOnce();
    expect(repo.markSucceeded).not.toHaveBeenCalled();
    expect(repo.markRunning).not.toHaveBeenCalled();
  });

  it('still scans on a QStash retry, when the job is already marked running', async () => {
    repo.getById.mockResolvedValue({ ...JOB, status: 'running' });
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await runScanJob('j1', { manageJobStatus: false });
    expect(run).toHaveBeenCalledOnce();
  });

  it('rethrows without marking failed — the run route records the failure', async () => {
    run.mockRejectedValue(new Error('scrape died'));
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await expect(runScanJob('j1', { manageJobStatus: false })).rejects.toThrow('scrape died');
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('still fails loudly when the job row is missing', async () => {
    repo.getById.mockResolvedValue(null);
    const { runScanJob } = await import('@/lib/scraping/runScanJob');
    await expect(runScanJob('j1', { manageJobStatus: false })).rejects.toThrow(/not found/i);
  });
});
