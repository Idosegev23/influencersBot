import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { pushFrontier, setCount } from '@/lib/pipeline/state';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function siteDiscoverStep(ctx: StepContext): Promise<StepResult> {
  if (!ctx.state.websiteUrl) return { status: 'advance' };
  let urls = await discoverSitemapUrls(ctx.state.websiteUrl);
  if (urls.length === 0) urls = [ctx.state.websiteUrl]; // BFS fallback seed
  if (ctx.state.options.maxPages && urls.length > ctx.state.options.maxPages) {
    urls = urls.slice(0, ctx.state.options.maxPages);
  }
  await pushFrontier(ctx.jobId, urls);
  await setCount(ctx.jobId, 'crawl', { done: 0, total: urls.length });
  return { status: 'advance' };
}
