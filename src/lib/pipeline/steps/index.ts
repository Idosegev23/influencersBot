import type { PipelineStep, StepContext } from '../types';
import { createAccountStep } from './create-account';
import { igScanStep } from './ig-scan';
import { transcribeStep } from './transcribe';
import { youtubeScanStep } from './youtube-scan';
import { tiktokScanStep } from './tiktok-scan';
import { siteDiscoverStep } from './site-discover';
import { siteCrawlStep } from './site-crawl';
import { ragIngestStep } from './rag-ingest';
import { productExtractStep } from './product-extract';
import { personaBuildStep } from './persona-build';
import { finalizeStep } from './finalize';

export type StepResult =
  | { status: 'advance' }
  | { status: 're-enqueue'; delaySeconds?: number }
  | { status: 'failed'; error: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

/**
 * A "website-only" account has no real Instagram handle. It is signalled by
 * `ctx.username` being empty or equal to the website host (domain anchor set by
 * the start route for website-only scans). When false, `ig-scan`/`transcribe`
 * skip immediately and persona is built from website content.
 */
/**
 * Incremental enrichment gate. When `options.enrichSources` is set, a scrape step
 * runs only if its source is in that list — the others skip. rag-ingest /
 * persona-build / finalize do NOT call this, so they always run and fold the newly
 * scraped source into the existing account content. No enrichSources = full scan.
 */
export function enrichSkips(ctx: StepContext, source: 'instagram' | 'website' | 'youtube' | 'tiktok'): boolean {
  const enrich = ctx.state.options?.enrichSources;
  if (!enrich || enrich.length === 0) return false;
  return !enrich.includes(source);
}

export function hasInstagram(ctx: StepContext): boolean {
  if (!ctx.username) return false;
  // Explicit signal from startPipeline wins: an IG handle can legitimately equal
  // the domain (e.g. @buyme.co.il), which the host-comparison heuristic below would
  // otherwise misread as "website-only" and skip the scrape.
  const flag = ctx.state.options?.hasIg;
  if (typeof flag === 'boolean') return flag;
  try { return ctx.username !== new URL(ctx.state.websiteUrl || 'http://x.invalid').host; } catch { return true; }
}

export const STEP_HANDLERS: Record<PipelineStep, StepHandler> = {
  'create-account': createAccountStep,
  'ig-scan': igScanStep,
  'transcribe': transcribeStep,
  'youtube-scan': youtubeScanStep,
  'tiktok-scan': tiktokScanStep,
  'site-discover': siteDiscoverStep,
  'site-crawl': siteCrawlStep,
  'rag-ingest': ragIngestStep,
  'product-extract': productExtractStep,
  'persona-build': personaBuildStep,
  'finalize': finalizeStep,
};
