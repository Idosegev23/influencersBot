/**
 * POST /api/manage/products/extract
 * Triggers AI extraction of products from scraped pages.
 * This is a long-running operation — runs extraction + enrichment.
 */

import { NextResponse } from 'next/server';
import { validateManageSession } from '@/lib/manage/auth';
import { extractAllProducts } from '@/lib/recommendations/extract-products';
import { enrichAllProducts } from '@/lib/recommendations/enrich-products';

export const maxDuration = 300; // 5 minutes for Vercel

export async function POST() {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Step 1: Extract products from scraped pages
    const extractionResult = await extractAllProducts(session.accountId);
    console.log('[ProductExtract] Extraction done:', {
      products: extractionResult.productsExtracted,
      series: extractionResult.seriesDetected,
      duration: `${extractionResult.durationMs}ms`,
    });

    // Step 2: Enrich with AI profiles + embeddings
    let enrichmentResult = null;
    if (extractionResult.productsExtracted > 0) {
      enrichmentResult = await enrichAllProducts(session.accountId);
      console.log('[ProductExtract] Enrichment done:', {
        enriched: enrichmentResult.productsEnriched,
        embeddings: enrichmentResult.embeddingsGenerated,
        complementary: enrichmentResult.complementaryMapped,
        duration: `${enrichmentResult.durationMs}ms`,
      });
    }

    return NextResponse.json({
      success: true,
      extraction: {
        totalPages: extractionResult.totalPages,
        productsExtracted: extractionResult.productsExtracted,
        seriesDetected: extractionResult.seriesDetected,
        errors: extractionResult.errors.length,
        durationMs: extractionResult.durationMs,
      },
      enrichment: enrichmentResult ? {
        productsEnriched: enrichmentResult.productsEnriched,
        embeddingsGenerated: enrichmentResult.embeddingsGenerated,
        complementaryMapped: enrichmentResult.complementaryMapped,
        errors: enrichmentResult.errors.length,
        durationMs: enrichmentResult.durationMs,
      } : null,
    });
  } catch (error: any) {
    console.error('[ProductExtract] Error:', error);
    return NextResponse.json({
      error: 'Extraction failed',
      details: error.message,
    }, { status: 500 });
  }
}
