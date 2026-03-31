/**
 * API: Start Content Processing
 * מפעיל עיבוד תוכן ובניית פרסונה עבור חשבון
 */

import { NextRequest, NextResponse } from 'next/server';
import { processAccountContent } from '@/lib/processing/content-processor-orchestrator';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/process/start
 * Start content processing for an account
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const body = await req.json();
    const { accountId, transcribeVideos, maxVideos, buildPersona } = body;

    // Validate
    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Missing accountId' },
        { status: 400 }
      );
    }

    console.log(`[Process API] Starting content processing for account ${accountId}`);
    console.log(`[Process API] Options:`, {
      transcribeVideos: transcribeVideos ?? true,
      maxVideos: maxVideos || 20,
      buildPersona: buildPersona ?? true,
    });

    // Start processing (this will run in background)
    runProcessingInBackground(accountId, {
      transcribeVideos: transcribeVideos ?? true,
      maxVideos: maxVideos || 20,
      buildPersona: buildPersona ?? true,
    }).catch(err => {
      console.error(`[Process API] Background processing failed:`, err);
    });

    return NextResponse.json({
      success: true,
      message: 'עיבוד התחיל ברקע',
      accountId,
      estimatedTime: '2-5 דקות',
    });

  } catch (error: any) {
    console.error('[Process API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Run processing in background
 */
async function runProcessingInBackground(
  accountId: string,
  options: { transcribeVideos: boolean; maxVideos: number; buildPersona: boolean }
) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 [Background] Starting processing for account ${accountId}`);
    console.log(`${'='.repeat(60)}\n`);

    const result = await processAccountContent({
      accountId,
      transcribeVideos: options.transcribeVideos,
      maxVideosToTranscribe: options.maxVideos,
      buildRagIndex: true,
      buildPersona: options.buildPersona,
      priority: 'normal',
    });

    console.log(`\n${'='.repeat(60)}`);
    if (result.success) {
      console.log(`✅ [Background] Processing completed successfully!`);
      console.log(`   - Videos transcribed: ${result.stats.videosTranscribed}`);
      console.log(`   - Persona built: ${result.stats.personaBuilt ? 'Yes' : 'No'}`);
      console.log(`   - Time: ${(result.stats.processingTimeMs / 1000).toFixed(2)}s`);
    } else {
      console.log(`⚠️ [Background] Processing completed with errors`);
      console.log(`   - Errors: ${result.errors.join(', ')}`);
    }
    console.log(`${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [Background] Processing failed:`, error.message || error);
    console.error(`${'='.repeat(60)}\n`);
  }
}
