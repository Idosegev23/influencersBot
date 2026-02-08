/**
 * API: Get Transcription Progress
 * מחזיר progress של תמלול לחשבון
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transcribe/progress?accountId=xxx
 * Get transcription progress for account
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Missing accountId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Count by status
    const [
      { count: completed },
      { count: processing },
      { count: failed },
      { count: pending },
    ] = await Promise.all([
      supabase.from('instagram_transcriptions').select('*', { count: 'exact', head: true }).eq('account_id', accountId).eq('processing_status', 'completed'),
      supabase.from('instagram_transcriptions').select('*', { count: 'exact', head: true }).eq('account_id', accountId).eq('processing_status', 'processing'),
      supabase.from('instagram_transcriptions').select('*', { count: 'exact', head: true }).eq('account_id', accountId).eq('processing_status', 'failed'),
      supabase.from('instagram_transcriptions').select('*', { count: 'exact', head: true }).eq('account_id', accountId).eq('processing_status', 'pending'),
    ]);

    // Get recent transcriptions for summary
    const { data: recent } = await supabase
      .from('instagram_transcriptions')
      .select('source_type, transcription_text, language, processed_at')
      .eq('account_id', accountId)
      .eq('processing_status', 'completed')
      .order('processed_at', { ascending: false })
      .limit(3);

    const total = (completed || 0) + (processing || 0) + (failed || 0) + (pending || 0);
    const progress = total > 0 ? Math.round(((completed || 0) / total) * 100) : 0;

    return NextResponse.json({
      success: true,
      progress: {
        total,
        completed: completed || 0,
        processing: processing || 0,
        failed: failed || 0,
        pending: pending || 0,
        percentage: progress,
      },
      recentTranscriptions: recent?.map(t => ({
        sourceType: t.source_type,
        language: t.language,
        preview: t.transcription_text?.substring(0, 100) + '...',
        processedAt: t.processed_at,
      })) || [],
    });

  } catch (error: any) {
    console.error('[Transcribe Progress API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
