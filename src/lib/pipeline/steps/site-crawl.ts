import { popFrontier, frontierSize, pushFrontier, setCount, getCursor, setCursor } from '@/lib/pipeline/state';
import { redisSetNx, redisExists } from '@/lib/redis';
import { crawlPageBatch, persistPageHtml } from '@/lib/pipeline/crawl';
import { fetchApifyPages, getApifyRunState } from '@/lib/pipeline/apify-crawl';
import { createClient } from '@/lib/supabase/server';
import { BATCH_SIZES } from '../types';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';

const KEY_TTL = 86400; // 24h — matches the pipeline cursor/frontier key lifetime

/** Re-enqueue ceiling for the apify transport; the run route has none of its own. */
const APIFY_MAX_BATCHES = 300;

/**
 * Batched site crawl. Pops a bounded slice of the URL frontier, fetches + persists
 * each page (via `crawlPageBatch`), and — only when the sitemap was empty and we
 * seeded from the homepage — follows newly-discovered same-host links (BFS fallback),
 * deduped across batches with a durable Redis `seen` guard and capped by `maxPages`.
 * Re-enqueues while the frontier still has URLs; advances once it drains.
 */
export async function siteCrawlStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'website')) return { status: 'advance' }; // enriching a different source
  if (ctx.state.crawlTransport === 'apify') return apifyCrawlBatch(ctx);
  const batchUrls = await popFrontier(ctx.jobId, BATCH_SIZES['site-crawl']);
  if (batchUrls.length === 0) return { status: 'advance' };

  const prevDone = ctx.state.counts?.crawl?.done ?? 0;
  const total = ctx.state.counts?.crawl?.total ?? batchUrls.length;
  let newTotal = total;

  // A batch that throws (network, parse, a hostile page) used to fail the whole job,
  // discarding Instagram, transcriptions and every step after the crawl. Lose the
  // batch, keep the scan: the popped URLs still count as done so progress advances
  // and the remaining frontier is worked normally.
  let discoveredLinks: string[] = [];
  try {
    ({ discoveredLinks } = await crawlPageBatch(batchUrls, ctx.accountId, ctx.state.options?.language));
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error(`[site-crawl] batch of ${batchUrls.length} failed for job ${ctx.jobId}: ${message}`);
    try {
      const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
      await getScanJobsRepo().addStepLog(
        ctx.jobId, 'site-crawl', 'failed', 0,
        `דילוג על ${batchUrls.length} עמודים: ${message}`,
      );
    } catch { /* logging the skip must never itself fail the job */ }
    await setCount(ctx.jobId, 'crawl', { done: prevDone + batchUrls.length, total });
    const left = await frontierSize(ctx.jobId);
    return left > 0 ? { status: 're-enqueue' } : { status: 'advance' };
  }

  // BFS fallback: only exercise Redis when there are links to consider, so this
  // step stays hermetic (no live Redis) when a sitemap already filled the frontier.
  if (discoveredLinks.length > 0) {
    const bfsKey = `pipeline:${ctx.jobId}:bfs`;
    // Decide BFS mode once, durably: a seeded single-URL frontier means no sitemap.
    // NEVER enter BFS in quote mode — a bounded category selection can resolve to a
    // single URL, and with maxPages null that would expand unbounded across the whole
    // site, defeating the caps. Quote mode always has an explicit `categories` list.
    if (ctx.batch === 0 && total <= 1 && !ctx.state.options?.categories?.length) {
      await redisSetNx(bfsKey, '1', KEY_TTL);
    }
    const bfsMode = await redisExists(bfsKey);

    if (bfsMode) {
      const maxPages = ctx.state.options?.maxPages ?? null;
      const toPush: string[] = [];
      for (const link of discoveredLinks) {
        if (maxPages && newTotal >= maxPages) break;
        // Durable per-URL dedupe across batches — new URLs only (prevents BFS loops).
        const fresh = await redisSetNx(
          `pipeline:${ctx.jobId}:seen:${encodeURIComponent(link)}`,
          '1',
          KEY_TTL
        );
        if (!fresh) continue;
        toPush.push(link);
        newTotal++;
      }
      if (toPush.length) await pushFrontier(ctx.jobId, toPush);
    }
  }

  await setCount(ctx.jobId, 'crawl', { done: prevDone + batchUrls.length, total: newTotal });

  const remaining = await frontierSize(ctx.jobId);
  return remaining > 0 ? { status: 're-enqueue' } : { status: 'advance' };
}

/**
 * Drain one batch of a browser crawl's dataset (the `apify` transport).
 *
 * The run produces pages while this drains them, so a batch may find nothing yet
 * even though the crawl is far from done — that re-enqueues rather than
 * advancing. The step only advances once the run has finished AND the dataset has
 * been read to the end, so no page is left behind.
 *
 * Pages are persisted through `persistPageHtml`, the same function the plain
 * fetch path uses, so a protected site and an unprotected one produce identical
 * rows. BFS belongs to the crawler here, so discovered links are ignored.
 */
async function apifyCrawlBatch(ctx: StepContext): Promise<StepResult> {
  const datasetId = ctx.state.apifyDatasetId;
  const runId = ctx.state.apifyRunId;
  if (!datasetId || !runId) {
    return { status: 'failed', error: 'apify transport selected but no run handle on the pipeline state' };
  }

  // The run route re-enqueues without a ceiling of its own, so a crawl that never
  // finishes would push itself around this loop forever. At a 20s poll this is
  // well over an hour — far past any legitimate crawl of the sizes we cap at.
  //
  // Hitting the ceiling ADVANCES with whatever was crawled rather than failing.
  // Failing here would discard the pages already saved along with the Instagram,
  // Facebook and transcription work of every earlier step, to punish a crawl for
  // being slow. A short website is a worse demo; no demo is a worse outcome. What
  // was cut is named in the step log so it is not silently a "complete" scan.
  if (ctx.batch > APIFY_MAX_BATCHES) {
    const done = ctx.state.counts?.crawl?.done ?? 0;
    await setCount(ctx.jobId, 'crawl', { done, total: done });
    try {
      const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
      await getScanJobsRepo().addStepLog(
        ctx.jobId, 'site-crawl', 'completed', 100,
        `הזחילה נעצרה על ${done} עמודים אחרי ${ctx.batch} מנות — ריצת ${runId} לא הסתיימה בזמן`,
      );
    } catch { /* logging must never fail the job */ }
    console.warn(`[site-crawl/apify] ceiling reached for run ${runId} at ${done} pages`);
    return { status: 'advance' };
  }

  const offset = await getCursor(ctx.jobId, 'site-crawl');
  const runState = await getApifyRunState(runId);

  let pages;
  try {
    pages = await fetchApifyPages(datasetId, offset, BATCH_SIZES['site-crawl']);
  } catch (e: any) {
    // A dataset read failure mid-run is usually transient; a failure once the run
    // is over is not, and must not masquerade as a finished crawl.
    if (runState === 'running') return { status: 're-enqueue', delaySeconds: 20 };
    return { status: 'failed', error: `Apify dataset read failed: ${e?.message || e}` };
  }

  if (pages.length === 0) {
    if (runState === 'running') return { status: 're-enqueue', delaySeconds: 20 };
    if (runState === 'failed' && offset === 0) {
      return { status: 'failed', error: `Apify crawl ${runId} failed and produced no pages` };
    }
    const done = ctx.state.counts?.crawl?.done ?? offset;
    await setCount(ctx.jobId, 'crawl', { done, total: done });
    return { status: 'advance' };
  }

  const supabase = await createClient();
  let saved = 0;
  for (const page of pages) {
    const res = await persistPageHtml(page.url, page.html, ctx.accountId, supabase, {
      title: page.title,
      description: page.description,
      ogImage: page.ogImage,
      structuredData: page.structuredData,
      language: ctx.state.options?.language,
    });
    if (res.saved) saved++;
  }

  const nextOffset = offset + pages.length;
  await setCursor(ctx.jobId, 'site-crawl', nextOffset);
  await setCount(ctx.jobId, 'crawl', {
    done: nextOffset,
    total: Math.max(ctx.state.counts?.crawl?.total ?? nextOffset, nextOffset),
  });
  console.log(`[site-crawl/apify] saved ${saved}/${pages.length} pages (offset ${offset} → ${nextOffset})`);

  return { status: 're-enqueue' };
}
