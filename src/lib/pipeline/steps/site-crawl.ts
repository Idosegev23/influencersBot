import { popFrontier, frontierSize, pushFrontier, setCount } from '@/lib/pipeline/state';
import { redisSetNx, redisExists } from '@/lib/redis';
import { crawlPageBatch } from '@/lib/pipeline/crawl';
import { BATCH_SIZES } from '../types';
import type { StepContext } from '../types';
import type { StepResult } from './index';

const KEY_TTL = 86400; // 24h — matches the pipeline cursor/frontier key lifetime

/**
 * Batched site crawl. Pops a bounded slice of the URL frontier, fetches + persists
 * each page (via `crawlPageBatch`), and — only when the sitemap was empty and we
 * seeded from the homepage — follows newly-discovered same-host links (BFS fallback),
 * deduped across batches with a durable Redis `seen` guard and capped by `maxPages`.
 * Re-enqueues while the frontier still has URLs; advances once it drains.
 */
export async function siteCrawlStep(ctx: StepContext): Promise<StepResult> {
  const batchUrls = await popFrontier(ctx.jobId, BATCH_SIZES['site-crawl']);
  if (batchUrls.length === 0) return { status: 'advance' };

  const prevDone = ctx.state.counts?.crawl?.done ?? 0;
  const total = ctx.state.counts?.crawl?.total ?? batchUrls.length;
  let newTotal = total;

  const { discoveredLinks } = await crawlPageBatch(batchUrls, ctx.accountId);

  // BFS fallback: only exercise Redis when there are links to consider, so this
  // step stays hermetic (no live Redis) when a sitemap already filled the frontier.
  if (discoveredLinks.length > 0) {
    const bfsKey = `pipeline:${ctx.jobId}:bfs`;
    // Decide BFS mode once, durably: a seeded single-URL frontier means no sitemap.
    if (ctx.batch === 0 && total <= 1) await redisSetNx(bfsKey, '1', KEY_TTL);
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
