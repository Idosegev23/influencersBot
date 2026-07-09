import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { saveState } from '@/lib/pipeline/state';
import { publishStep } from '@/lib/pipeline/qstash';
import { DEFAULT_SCAN_CONFIG } from '@/lib/scraping/newScanOrchestrator';
import { normalizeIgUsername } from '@/lib/pipeline/username';
import type { PipelineState } from '@/lib/pipeline/types';

export interface StartPipelineInput {
  accountId: string;
  username?: string;
  websiteUrl?: string | null;
  isDemo?: boolean;
  transcribe?: boolean;
  maxPages?: number | null;
  postsLimit?: number;
  archetype?: string;
  scanMode?: 'full' | 'quote';
  categories?: unknown;
  youtube?: string;
  tiktok?: string;
  requestedBy?: string;
}

export type StartPipelineResult = { jobId: string } | { error: string; status: number };

/**
 * Core of the scan pipeline kickoff: normalize the sources, create a scan job,
 * persist the pipeline state, and enqueue the first step. Shared by the admin
 * "add account" route (`/api/pipeline/start`) and the per-account re-scan
 * (`/api/admin/accounts/[id]/sources` POST) so both behave identically.
 */
export async function startPipeline(input: StartPipelineInput): Promise<StartPipelineResult> {
  const {
    accountId,
    username,
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
    requestedBy = 'admin:pipeline',
  } = input;

  // Normalize the IG handle — admins often paste a full profile URL / @ / ?hl=he,
  // which used verbatim as the scrape handle yields an empty account.
  let uname = username ? normalizeIgUsername(username) : username;
  if (!uname && websiteUrl) {
    try {
      uname = new URL(websiteUrl).host;
    } catch {
      return { error: 'bad websiteUrl', status: 400 };
    }
  }
  // No IG and no website but a YouTube/TikTok source given — anchor on that handle.
  if (!uname && (youtube || tiktok)) uname = String(tiktok || youtube).replace(/^@/, '').slice(0, 60);

  if (!uname || !accountId) {
    return { error: 'username (or websiteUrl / youtube / tiktok) and accountId required', status: 400 };
  }

  const repo = getScanJobsRepo();
  const job = await repo.create({
    username: uname,
    account_id: accountId,
    priority: 100,
    requested_by: requestedBy,
    config: { ...DEFAULT_SCAN_CONFIG, postsLimit, transcribeReels: transcribe },
  });

  const state: PipelineState = {
    currentStep: 'create-account',
    counts: {},
    cursors: {},
    websiteUrl: websiteUrl || undefined,
    options: { transcribe, maxPages, postsLimit, isDemo, archetype, scanMode, categories, youtube, tiktok },
  };
  await saveState(job.id, state);
  await publishStep({ jobId: job.id, step: 'create-account', batch: 0 });

  return { jobId: job.id };
}
