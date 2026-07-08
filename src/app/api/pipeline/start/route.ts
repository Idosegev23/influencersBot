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
    scanMode = 'full',
    categories,
  } = body;

  // Website-only (quote) scans may omit the IG username — anchor on the site domain instead.
  let uname = username;
  if (!uname && websiteUrl) {
    try { uname = new URL(websiteUrl).host; } catch { return NextResponse.json({ error: 'bad websiteUrl' }, { status: 400 }); }
  }

  if (!uname || !accountId) {
    return NextResponse.json({ error: 'username (or websiteUrl) and accountId required' }, { status: 400 });
  }

  const repo = getScanJobsRepo();
  const job = await repo.create({
    username: uname,
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
    options: { transcribe, maxPages, postsLimit, isDemo, archetype, scanMode, categories },
  };
  await saveState(job.id, state);
  await publishStep({ jobId: job.id, step: 'create-account', batch: 0 });

  return NextResponse.json({ jobId: job.id });
}
