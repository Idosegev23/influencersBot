/**
 * POST /api/scraping/incremental
 * סריקה חכמה - רק תוכן חדש
 */

import { NextResponse } from 'next/server';
import { runIncrementalScan, IncrementalScanConfig } from '@/lib/scraping/incrementalScanOrchestrator';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, accountId, config } = body;

    if (!username || !accountId) {
      return NextResponse.json(
        { error: 'Username and accountId are required' },
        { status: 400 }
      );
    }

    console.log(`[Incremental Scan API] Starting for @${username}, account: ${accountId}`);

    const result = await runIncrementalScan(username, accountId, config as Partial<IncrementalScanConfig>);

    if (result.success) {
      console.log(`[Incremental Scan API] ✅ Success:`, result.stats);
      return NextResponse.json({
        success: true,
        stats: result.stats,
        duration: result.duration,
        message: `נמצאו ${result.stats.newPostsFound} פוסטים חדשים, ${result.stats.newHighlightsFound} הילייטס חדשים`,
      });
    } else {
      console.error(`[Incremental Scan API] ❌ Failed:`, result.error);
      return NextResponse.json(
        { error: result.error || 'Scan failed', stats: result.stats },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[Incremental Scan API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
