/**
 * POST /api/admin/full-scan
 * סריקה מלאה + עיבוד + RAG — הכל סינכרוני
 * Vercel Pro: maxDuration = 600s (10 min)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { runScanJob } from '@/lib/scraping/runScanJob';
import { processAccountContent } from '@/lib/processing/content-processor-orchestrator';
import { DEFAULT_SCAN_CONFIG } from '@/lib/scraping/newScanOrchestrator';
import { hashPassword } from '@/lib/utils';

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    // Auth: CRON_SECRET
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, accountId } = await req.json();
    if (!username || !accountId) {
      return NextResponse.json({ error: 'username and accountId required' }, { status: 400 });
    }

    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [Full Scan] Starting for @${username}`);
    console.log(`${'='.repeat(60)}\n`);

    // Step 0: Ensure account has a login password for dashboard access
    const supabaseInit = await createClient();
    const { data: acct } = await supabaseInit
      .from('accounts')
      .select('security_config')
      .eq('id', accountId)
      .single();

    if (!acct?.security_config?.admin_password_hash) {
      const defaultHash = await hashPassword('123456');
      await supabaseInit
        .from('accounts')
        .update({
          security_config: {
            ...(acct?.security_config || {}),
            admin_password_hash: defaultHash,
          },
        })
        .eq('id', accountId);
      console.log(`[Full Scan] Set default dashboard password for @${username}`);
    }

    // Step 1: Create scan job with FULL config
    const repo = getScanJobsRepo();
    const job = await repo.create({
      username,
      account_id: accountId,
      priority: 100,
      requested_by: 'admin:full-scan',
      config: DEFAULT_SCAN_CONFIG,
    });

    console.log(`[Full Scan] Created job ${job.id} — starting scan...`);

    // Step 2: Run FULL scan (await — don't fire-and-forget!)
    await runScanJob(job.id);

    const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Full Scan] Scan completed in ${scanTime}s — starting processing...`);

    // Step 3: Process content (transcription + persona + RAG)
    const processingResult = await processAccountContent({
      accountId,
      scanJobId: job.id,
      transcribeVideos: true,
      maxVideosToTranscribe: 999,
      buildRagIndex: true,
      buildPersona: true,
      priority: 'high',
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Gather stats
    const supabase = await createClient();
    const { count: postsCount } = await supabase
      .from('instagram_posts')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    const { count: commentsCount } = await supabase
      .from('instagram_comments')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    const { count: chunksCount } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [Full Scan] @${username} completed in ${totalTime}s`);
    console.log(`   Posts: ${postsCount}, Comments: ${commentsCount}, RAG chunks: ${chunksCount}`);
    console.log(`   Persona: ${processingResult.stats.personaBuilt ? 'Built' : 'Failed'}`);
    console.log(`${'='.repeat(60)}\n`);

    return NextResponse.json({
      success: true,
      username,
      accountId,
      jobId: job.id,
      totalTimeSeconds: parseFloat(totalTime),
      scan: {
        posts: postsCount,
        comments: commentsCount,
      },
      processing: {
        videosTranscribed: processingResult.stats.videosTranscribed,
        personaBuilt: processingResult.stats.personaBuilt,
        ragDocuments: processingResult.stats.ragDocumentsIngested,
        ragChunks: chunksCount,
      },
      errors: processingResult.errors,
    });

  } catch (error: any) {
    console.error('[Full Scan] Error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
