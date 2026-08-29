import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { pushFrontier, setCount, loadState, saveState } from '@/lib/pipeline/state';
import { groupUrlsByPath } from '@/lib/pipeline/discover';
import { isSiteChallenged, startApifyCrawl } from '@/lib/pipeline/apify-crawl';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';

/** Pages to crawl on a challenged site when the scan set no explicit cap. */
const APIFY_DEFAULT_MAX_PAGES = 300;

export async function siteDiscoverStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'website')) return { status: 'advance' }; // enriching a different source
  if (!ctx.state.websiteUrl) return { status: 'advance' };

  // A site behind a bot challenge answers every plain fetch with a 403, including
  // its sitemap. Discovering nothing and carrying on would produce a job that
  // reports success with zero website pages — the failure this whole branch
  // exists to prevent. Hand the crawl to a real browser instead.
  try {
    if (await isSiteChallenged(ctx.state.websiteUrl)) {
      return await startChallengedCrawl(ctx);
    }
  } catch (e: any) {
    // Starting the browser crawl failed. This one DOES fail the step: we know the
    // site is guarded, so falling through to the fetch path would crawl nothing
    // while claiming to have finished.
    const message = e?.message || String(e);
    console.error(`[site-discover] apify transport failed for job ${ctx.jobId}: ${message}`);
    return { status: 'failed', error: `Bot-protected site and the browser crawl could not start: ${message}` };
  }

  try {
    return await discoverAndQueue(ctx);
  } catch (e: any) {
    // The website is ONE source among several, and it is scanned at step 6 of 11 —
    // after Instagram, transcription, YouTube and TikTok have already succeeded.
    // Letting it fail the job threw all of that away, plus every step after it
    // (rag-ingest, product-extract, persona-build, finalize), because someone typed
    // a domain without https://. Record it and carry on with the sources that work.
    const message = e?.message || String(e);
    console.error(`[site-discover] skipping website scan for job ${ctx.jobId}: ${message}`);
    try {
      const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
      await getScanJobsRepo().addStepLog(
        ctx.jobId, 'site-discover', 'failed', 0,
        `דילוג על סריקת האתר (${ctx.state.websiteUrl}): ${message}`,
      );
    } catch { /* logging the skip must never itself fail the job */ }
    // Empty frontier → site-crawl finds nothing to do and advances immediately.
    await setCount(ctx.jobId, 'crawl', { done: 0, total: 0 });
    return { status: 'advance' };
  }
}

/**
 * Kick off a browser crawl for a challenged site and record the handle on the
 * pipeline state. The frontier stays empty on purpose — site-crawl reads the
 * run's dataset instead, and BFS is the crawler's job now.
 */
async function startChallengedCrawl(ctx: StepContext): Promise<StepResult> {
  const maxPages = ctx.state.options?.maxPages ?? APIFY_DEFAULT_MAX_PAGES;
  const handle = await startApifyCrawl(ctx.state.websiteUrl!, maxPages, ctx.state.options?.seedUrls ?? []);

  // Re-read before writing: other steps mutate state, and this runs late enough
  // that a blind overwrite could drop their counts.
  const state = await loadState(ctx.jobId);
  state.crawlTransport = 'apify';
  state.apifyRunId = handle.runId;
  state.apifyDatasetId = handle.datasetId;
  await saveState(ctx.jobId, state);

  await setCount(ctx.jobId, 'crawl', { done: 0, total: maxPages });

  try {
    const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
    await getScanJobsRepo().addStepLog(
      ctx.jobId, 'site-discover', 'completed', 100,
      `האתר מוגן בבוט-צ'לנג' — סריקה בדפדפן אמיתי (Apify run ${handle.runId}), עד ${maxPages} עמודים`,
    );
  } catch { /* logging must never fail the job */ }

  return { status: 'advance' };
}

async function discoverAndQueue(ctx: StepContext): Promise<StepResult> {
  let urls = await discoverSitemapUrls(ctx.state.websiteUrl!);
  if (urls.length === 0) urls = [ctx.state.websiteUrl!]; // BFS fallback seed

  const categories = ctx.state.options.categories;
  if (categories && categories.length) {
    // Quote mode: keep only selected path patterns, first `cap` urls each (cap 0 excluded).
    const capByPattern = new Map(categories.map(c => [c.pathPattern, c.cap]));
    const groups = groupUrlsByPath(urls);
    const selected: string[] = [];
    for (const g of groups) {
      const cap = capByPattern.get(g.pathPattern);
      if (cap === undefined || cap <= 0) continue; // not selected / excluded
      // groups only keep 5 sample urls — re-collect all urls for this pattern, then cap
      const all = urls.filter(u => {
        try {
          const segs = new URL(u).pathname.split('/').filter(Boolean);
          return (segs.length <= 1 ? '/' : `/${segs[0]}`) === g.pathPattern;
        } catch { return false; }
      });
      selected.push(...all.slice(0, cap));
    }
    urls = selected;
  } else if (ctx.state.options.maxPages && urls.length > ctx.state.options.maxPages) {
    urls = urls.slice(0, ctx.state.options.maxPages);
  }

  // Explicit seeds bypass the sitemap entirely. SPA storefronts (headless Magento/Shopify)
  // routinely list only category pages in their sitemap, leaving product detail pages
  // reachable solely as links inside the listing HTML — seeds are how those get crawled.
  // They are appended AFTER the caps so neither `categories` nor `maxPages` truncates them.
  const seedUrls = ctx.state.options.seedUrls;
  if (seedUrls && seedUrls.length) urls = [...new Set([...urls, ...seedUrls])];

  await pushFrontier(ctx.jobId, urls);
  await setCount(ctx.jobId, 'crawl', { done: 0, total: urls.length });
  return { status: 'advance' };
}
