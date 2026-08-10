import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { pushFrontier, setCount } from '@/lib/pipeline/state';
import { groupUrlsByPath } from '@/lib/pipeline/discover';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';

export async function siteDiscoverStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'website')) return { status: 'advance' }; // enriching a different source
  if (!ctx.state.websiteUrl) return { status: 'advance' };

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
