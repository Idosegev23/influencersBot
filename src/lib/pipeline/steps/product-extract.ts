import { extractAllProducts } from '@/lib/recommendations/extract-products';
import { enrichAllProducts } from '@/lib/recommendations/enrich-products';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';

/**
 * Product-extract step. Only meaningful for website-backed accounts — a
 * pure-Instagram account has no product catalog, so we skip to the next step.
 *
 * Reuses the library equivalents of the `extract-products-from-rag` /
 * `enrich-products` CLI scripts: `extractAllProducts` pulls structured products
 * out of scraped pages into `widget_products`, and `enrichAllProducts` adds AI
 * profiles + embeddings for the recommendation engine.
 */
export async function productExtractStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'website')) return { status: 'advance' }; // enriching a different source
  if (!ctx.state.websiteUrl) return { status: 'advance' };

  // Cap for serverless time budget — large catalogs (Carolina ~1,444 products)
  // would exceed maxDuration if every page went through Gemini extraction.
  // Full-catalog ingestion is a follow-up (batch this step like site-crawl).
  await extractAllProducts(ctx.accountId, { maxPages: 200 });
  await enrichAllProducts(ctx.accountId);

  return { status: 'advance' };
}
