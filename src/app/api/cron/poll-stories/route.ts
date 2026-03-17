/**
 * Cron: Poll for new Instagram stories every 30 minutes
 * GET /api/cron/poll-stories
 *
 * Checks all connected Graph API accounts for new stories,
 * transcribes them (Gemini vision), and indexes to RAG.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pollAndProcessNewStories } from '@/lib/instagram-graph/story-processor';

export const maxDuration = 120; // Stories may need transcription

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] poll-stories: starting...');
  const start = Date.now();

  try {
    const result = await pollAndProcessNewStories();
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`[Cron] poll-stories: done in ${durationSec}s — ${result.storiesNew} new, ${result.storiesTranscribed} transcribed`);

    return NextResponse.json({
      status: 'ok',
      duration: `${durationSec}s`,
      ...result,
    });
  } catch (error: any) {
    console.error('[Cron] poll-stories error:', error.message);
    return NextResponse.json({
      status: 'error',
      message: error.message,
    }, { status: 500 });
  }
}
