/**
 * API: Transcribe Single Video
 * תמלול סרטון בודד (serverless function נפרדת)
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribeVideo, saveTranscription } from '@/lib/transcription/gemini-transcriber';

export const dynamic = 'force-dynamic';
export const maxDuration = 480; // 8 minutes per video (Vercel timeout)

/**
 * POST /api/transcribe/single
 * Transcribe a single video
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, sourceType, sourceId, videoUrl, videoDuration } = body;

    // Validate
    if (!accountId || !sourceType || !sourceId || !videoUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`[Transcribe API] Starting for ${sourceType}:${sourceId}`);

    // Transcribe
    const result = await transcribeVideo({
      source_type: sourceType,
      source_id: sourceId,
      video_url: videoUrl,
      video_duration: videoDuration,
    });

    // Save
    const savedId = await saveTranscription(
      accountId,
      {
        source_type: sourceType,
        source_id: sourceId,
        video_url: videoUrl,
        video_duration: videoDuration,
      },
      result
    );

    console.log(`[Transcribe API] ${result.success ? 'Success' : 'Failed'}:`, savedId);

    return NextResponse.json({
      success: result.success,
      transcriptionId: savedId,
      transcription: result.transcription,
      error: result.error,
    });

  } catch (error: any) {
    console.error('[Transcribe API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
