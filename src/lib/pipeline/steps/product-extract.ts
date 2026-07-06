import { extractAllProducts } from '@/lib/recommendations/extract-products';
import { enrichAllProducts } from '@/lib/recommendations/enrich-products';
import type { StepContext } from '../types';
import type { StepResult } from './index';

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
  if (!ctx.state.websiteUrl) return { status: 'advance' };

  await extractAllProducts(ctx.accountId);
  await enrichAllProducts(ctx.accountId);

  return { status: 'advance' };
}
