/**
 * GET /api/cron/compute-hot-topics
 * Runs every 3 hours — clusters entities, computes heat scores, generates summaries.
 * Only processes media_news accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeHotTopics } from '@/lib/hot-topics/compute';

export const maxDuration = 300; // 5 minutes

export async function GET(req: NextRequest) {
  try {
    // Security: Verify cron secret
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cron/compute-hot-topics] Starting...');
    const result = await computeHotTopics();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[cron/compute-hot-topics] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
