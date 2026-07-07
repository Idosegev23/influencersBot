import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { saveState } from '@/lib/pipeline/state';
import { publishStep } from '@/lib/pipeline/qstash';
import { DEFAULT_SCAN_CONFIG } from '@/lib/scraping/newScanOrchestrator';
import type { PipelineState } from '@/lib/pipeline/types';

export async function POST(req: Request) {
  // Auth: admin cookie OR CRON_SECRET bearer (mirrors /api/admin/full-scan) so the
  // pipeline can be triggered headlessly for acceptance runs / automation.
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;
  const hasCronToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
  if (!hasCronToken) {
    const denied = await requireAdminAuth();
    if (denied) return denied;
  }

  const body = await req.json();
  const {
    username,
    accountId,
    websiteUrl,
    isDemo = true,
    transcribe = true,
    maxPages = null,
    postsLimit = DEFAULT_SCAN_CONFIG.postsLimit,
    archetype = 'brand',
  } = body;

  if (!username || !accountId) {
    return NextResponse.json({ error: 'username and accountId required' }, { status: 400 });
  }

  const repo = getScanJobsRepo();
  const job = await repo.create({
    username,
    account_id: accountId,
    priority: 100,
    requested_by: 'admin:pipeline',
    config: { ...DEFAULT_SCAN_CONFIG, postsLimit, transcribeReels: transcribe },
  });

  const state: PipelineState = {
    currentStep: 'create-account',
    counts: {},
    cursors: {},
    websiteUrl,
    options: { transcribe, maxPages, postsLimit, isDemo, archetype },
  };
  await saveState(job.id, state);
  await publishStep({ jobId: job.id, step: 'create-account', batch: 0 });

  return NextResponse.json({ jobId: job.id });
}
