import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { saveState } from '@/lib/pipeline/state';
import { publishStep } from '@/lib/pipeline/qstash';
import { DEFAULT_SCAN_CONFIG } from '@/lib/scraping/newScanOrchestrator';
import { normalizeIgUsername } from '@/lib/pipeline/username';
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
    youtube,
    tiktok,
  } = body;

  // Normalize the IG handle — admins often paste a full profile URL / @ / ?hl=he,
  // which used verbatim as the scrape handle yields an empty account.
  let uname = username ? normalizeIgUsername(username) : username;
  if (!uname && websiteUrl) {
    try { uname = new URL(websiteUrl).host; } catch { return NextResponse.json({ error: 'bad websiteUrl' }, { status: 400 }); }
  }
  // No IG and no website but a YouTube/TikTok source given — anchor on that handle.
  if (!uname && (youtube || tiktok)) uname = String(tiktok || youtube).replace(/^@/, '').slice(0, 60);

  if (!uname || !accountId) {
    return NextResponse.json({ error: 'username (or websiteUrl / youtube / tiktok) and accountId required' }, { status: 400 });
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
    options: { transcribe, maxPages, postsLimit, isDemo, archetype, scanMode, categories, youtube, tiktok },
  };
  await saveState(job.id, state);
  await publishStep({ jobId: job.id, step: 'create-account', batch: 0 });

  return NextResponse.json({ jobId: job.id });
}
