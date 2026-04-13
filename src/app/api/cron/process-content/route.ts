/**
 * GET /api/cron/process-content
 * Catch-up cron — processes RAG + persona for accounts where the daily-scan's
 * fire-and-forget background processing was killed by Vercel's function timeout.
 *
 * Runs every 10 minutes in 05:00-07:59 UTC (after daily-scan finishes at ~04:59).
 * Each invocation handles ONE account that needs processing.
 *
 * Detection: last scan_job.finished_at > last document_chunks.created_at
 *            → means scan completed but RAG was never rebuilt.
 *
 * Vercel Pro: maxDuration = 600s (10 min)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 600;

export async function GET(req: NextRequest) {
  try {
    // Security: Verify cron secret
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron:process-content] Starting content processing catch-up...');

    const supabase = await createClient();

    // Find accounts where last scan is NEWER than last RAG update
    const { data: staleAccounts, error: queryError } = await supabase.rpc(
      'get_accounts_needing_processing'
    );

    // If RPC doesn't exist, fall back to raw query
    let accountsToProcess: Array<{ id: string; username: string; last_scan: string; last_rag: string | null }> = [];

    if (queryError || !staleAccounts) {
      console.log('[Cron:process-content] RPC not found, using direct query...');

      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, config')
        .eq('type', 'creator')
        .eq('status', 'active');

      if (!accounts || accounts.length === 0) {
        return NextResponse.json({ message: 'No active accounts', processed: null });
      }

      // For each account, check if scan > rag
      for (const account of accounts) {
        const username = (account.config as any)?.username;
        if (!username) continue;

        // Get last finished scan
        const { data: lastScan } = await supabase
          .from('scan_jobs')
          .select('finished_at')
          .eq('account_id', account.id)
          .eq('status', 'succeeded')
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastScan?.finished_at) continue;

        // Get last RAG chunk
        const { data: lastRag } = await supabase
          .from('document_chunks')
          .select('created_at')
          .eq('account_id', account.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const scanTime = new Date(lastScan.finished_at).getTime();
        const ragTime = lastRag ? new Date(lastRag.created_at).getTime() : 0;

        // If scan is newer than RAG by more than 30 minutes → needs processing
        if (scanTime - ragTime > 30 * 60 * 1000) {
          accountsToProcess.push({
            id: account.id,
            username,
            last_scan: lastScan.finished_at,
            last_rag: lastRag?.created_at || null,
          });
        }
      }
    } else {
      accountsToProcess = staleAccounts;
    }

    if (accountsToProcess.length === 0) {
      console.log('[Cron:process-content] All accounts up-to-date!');
      return NextResponse.json({
        success: true,
        message: 'All accounts have up-to-date RAG indexes',
        processed: null,
        pending: 0,
      });
    }

    // Sort by oldest RAG first (most stale = highest priority)
    accountsToProcess.sort((a, b) => {
      const aTime = a.last_rag ? new Date(a.last_rag).getTime() : 0;
      const bTime = b.last_rag ? new Date(b.last_rag).getTime() : 0;
      return aTime - bTime;
    });

    // Pick ONE account to process
    const account = accountsToProcess[0];
    const pendingCount = accountsToProcess.length - 1;

    console.log(`[Cron:process-content] Processing @${account.username} (${pendingCount} more pending)`);
    console.log(`  Last scan: ${account.last_scan}`);
    console.log(`  Last RAG:  ${account.last_rag || 'never'}`);

    // Run content processing SYNCHRONOUSLY (with await!)
    const startTime = Date.now();

    try {
      const { processAccountContent } = await import(
        '@/lib/processing/content-processor-orchestrator'
      );

      // Limit transcriptions per cron run to fit within Vercel's 10-min timeout.
      // ~10s per transcription → 30 transcriptions ≈ 5 min, leaving 5 min for RAG + persona.
      // Accounts with more untranscribed videos will be picked up in the next cron run.
      const result = await processAccountContent({
        accountId: account.id,
        transcribeVideos: true,
        maxVideosToTranscribe: 30,
        buildRagIndex: true,
        buildPersona: true,
        priority: 'normal',
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`[Cron:process-content] ✅ @${account.username} processed in ${duration}s`);
      console.log(`  Videos transcribed: ${result.stats.videosTranscribed}`);
      console.log(`  RAG docs: ${result.stats.ragDocumentsIngested}`);
      console.log(`  Persona: ${result.stats.personaBuilt}`);
      console.log(`  Errors: ${result.errors.length}`);

      return NextResponse.json({
        success: result.success,
        message: `Processed @${account.username}`,
        processed: {
          username: account.username,
          accountId: account.id,
          duration: `${duration}s`,
          videosTranscribed: result.stats.videosTranscribed,
          ragDocuments: result.stats.ragDocumentsIngested,
          personaBuilt: result.stats.personaBuilt,
          errors: result.errors,
        },
        pending: pendingCount,
      });
    } catch (err: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[Cron:process-content] ❌ @${account.username} failed after ${duration}s:`, err.message);

      return NextResponse.json({
        success: false,
        message: `Failed to process @${account.username}`,
        processed: {
          username: account.username,
          accountId: account.id,
          duration: `${duration}s`,
          error: err.message?.substring(0, 300),
        },
        pending: pendingCount,
      });
    }
  } catch (error: any) {
    console.error('[Cron:process-content] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
