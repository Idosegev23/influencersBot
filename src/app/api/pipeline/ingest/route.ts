/**
 * POST /api/pipeline/ingest
 * Manual trigger for RAG vector ingestion
 * Builds/rebuilds vector embeddings for an account's content
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestAllForAccount } from '@/lib/rag/ingest';
import type { EntityType } from '@/lib/rag/types';

// Allow up to 5 minutes for large accounts
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // Auth: require CRON_SECRET for security
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { accountId, entityTypes } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    console.log(`[Pipeline/Ingest] Starting RAG ingestion for account: ${accountId}`);
    if (entityTypes) {
      console.log(`[Pipeline/Ingest] Entity types: ${entityTypes.join(', ')}`);
    }

    const startTime = Date.now();

    const result = await ingestAllForAccount(accountId, {
      entityTypes: entityTypes as EntityType[] | undefined,
    });

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Pipeline/Ingest] Complete in ${duration}s:`, {
      total: result.total,
      byType: result.byType,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: result.errors.length === 0,
      total: result.total,
      byType: result.byType,
      errors: result.errors,
      duration,
    });
  } catch (error: any) {
    console.error('[Pipeline/Ingest] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
