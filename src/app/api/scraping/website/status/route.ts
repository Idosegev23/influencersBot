/**
 * Website scan status — also polls Apify and triggers processing when crawl is done.
 * Called every 3s by the frontend. Each call is fast (<5s).
 *
 * Flow:
 * 1. If Apify run is still RUNNING → check dataset itemCount, update step logs
 * 2. If Apify run SUCCEEDED → trigger processing (save + RAG) via after()
 * 3. If Apify run FAILED → mark job failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export const maxDuration = 300;

const APIFY_TOKEN = process.env.APIFY_TOKEN;

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const repo = getScanJobsRepo();
    const job = await repo.getById(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const config = job.config as any;
    const apifyRunId = config?.apifyRunId;
    const apifyDatasetId = config?.apifyDatasetId;

    // If the job is still running and has an Apify run, poll Apify
    if (job.status === 'running' && apifyRunId && APIFY_TOKEN) {
      try {
        // Check Apify run status
        const runRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${APIFY_TOKEN}`,
          { signal: AbortSignal.timeout(10000) },
        );

        if (runRes.ok) {
          const runData = await runRes.json();
          const runStatus = runData.data.status;

          // Check dataset item count for progress
          let pagesFound = 0;
          if (apifyDatasetId) {
            try {
              const dsRes = await fetch(
                `https://api.apify.com/v2/datasets/${apifyDatasetId}?token=${APIFY_TOKEN}`,
                { signal: AbortSignal.timeout(10000) },
              );
              if (dsRes.ok) {
                const dsData = await dsRes.json();
                pagesFound = dsData.data?.itemCount || 0;
              }
            } catch {
              // Non-critical
            }
          }

          const startedAt = new Date(job.started_at || job.created_at).getTime();
          const elapsed = Math.round((Date.now() - startedAt) / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          const timeStr = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
          const maxPages = config?.maxPages || 50;

          if (runStatus === 'RUNNING' || runStatus === 'READY') {
            // Update progress
            const pct = 15 + Math.min(Math.round((pagesFound / maxPages) * 25), 25);
            await repo.addStepLog(jobId, 'crawl', 'running', pct,
              pagesFound > 0
                ? `סורק... נמצאו ${pagesFound} דפים (${timeStr})`
                : `מתחיל סריקה... (${timeStr})`
            );
          } else if (runStatus === 'SUCCEEDED') {
            // Crawl done! Update step log and trigger processing
            await repo.addStepLog(jobId, 'crawl', 'completed', 40,
              `סריקה הושלמה — ${pagesFound} דפים (${timeStr})`);
            await repo.addStepLog(jobId, 'save', 'running', 45, 'שומר ומעבד תוכן...');

            // Process results in background (save to DB + RAG)
            after(async () => {
              await processApifyResults(jobId, job.account_id!, config);
            });
          } else if (runStatus === 'FAILED' || runStatus === 'ABORTED') {
            await repo.addStepLog(jobId, 'crawl', 'failed', 40, `סריקה נכשלה: ${runStatus}`);
            await repo.markFailed(jobId, 'APIFY_RUN_FAILED', `Apify run ${runStatus}`);
          }
        }
      } catch (error: any) {
        console.error('[Website Status] Apify poll error:', error.message);
        // Non-fatal — we'll try again on next poll
      }
    }

    // Re-fetch job to get latest state
    const updatedJob = await repo.getById(jobId);

    return NextResponse.json({
      jobId: updatedJob!.id,
      status: updatedJob!.status,
      platform: updatedJob!.platform,
      steps: updatedJob!.step_logs || [],
      result: updatedJob!.result_summary,
      error: updatedJob!.error_message
        ? { code: updatedJob!.error_code, message: updatedJob!.error_message }
        : null,
      startedAt: updatedJob!.started_at,
      finishedAt: updatedJob!.finished_at,
    });
  } catch (error: any) {
    console.error('[Website Scan Status] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Process Apify crawl results — save to DB + index for RAG.
 * Runs via after() so it has its own 300s timeout.
 */
async function processApifyResults(jobId: string, accountId: string, config: any) {
  const repo = getScanJobsRepo();

  try {
    const { apifyDatasetId, url: rootUrl, maxPages } = config;

    // 1. Fetch all items from Apify dataset
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${apifyDatasetId}/items?token=${APIFY_TOKEN}`,
      { signal: AbortSignal.timeout(30000) },
    );

    if (!itemsRes.ok) {
      throw new Error(`Failed to fetch dataset: ${itemsRes.status}`);
    }

    const items: any[] = await itemsRes.json();
    console.log(`[Website Scan] Processing ${items.length} pages for job ${jobId}`);

    // 2. Parse pages
    const domain = new URL(rootUrl).hostname;
    let totalWords = 0;
    let totalImages = 0;
    const pages: any[] = [];

    for (const item of items) {
      const content = item.text || item.markdown || '';
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      // Extract image URLs
      const imageUrls: string[] = [];
      if (item.metadata?.ogImage) imageUrls.push(item.metadata.ogImage);
      if (item.jsonLd) {
        for (const ld of Array.isArray(item.jsonLd) ? item.jsonLd : [item.jsonLd]) {
          if (ld.image) {
            const imgs = Array.isArray(ld.image) ? ld.image : [ld.image];
            for (const img of imgs) {
              if (typeof img === 'string') imageUrls.push(img);
              else if (img.url) imageUrls.push(img.url);
            }
          }
        }
      }

      pages.push({
        url: item.url || '',
        title: item.metadata?.title || item.title || '',
        description: item.metadata?.description || '',
        content,
        imageUrls: [...new Set(imageUrls)],
        metaTags: item.metadata || {},
        structuredData: item.jsonLd || [],
        crawlDepth: item.depth || 0,
        parentUrl: item.referrerUrl || null,
        httpStatus: item.httpStatusCode || 200,
        wordCount,
      });

      totalWords += wordCount;
      totalImages += imageUrls.length;
    }

    // 3. Save to DB
    await repo.addStepLog(jobId, 'save', 'running', 50, `שומר ${pages.length} דפים...`);

    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const sessionId = `crawl_${Date.now()}`;
    let saved = 0;
    let failed = 0;

    for (const page of pages) {
      const { error } = await supabase.from('instagram_bio_websites').upsert(
        {
          account_id: accountId,
          url: page.url,
          page_title: page.title,
          page_description: page.description,
          page_content: page.content,
          image_urls: page.imageUrls,
          meta_tags: page.metaTags,
          structured_data: page.structuredData,
          extracted_data: {},
          parent_url: page.parentUrl,
          crawl_depth: page.crawlDepth,
          http_status: page.httpStatus,
          content_type: 'text/html',
          processing_status: 'completed',
          source_type: 'standalone',
          scraped_at: new Date().toISOString(),
          crawl_session_id: sessionId,
        },
        { onConflict: 'account_id,url' },
      );

      if (error) {
        console.error(`[Website Scan] Save error for ${page.url}:`, error.message);
        failed++;
      } else {
        saved++;
      }
    }

    await repo.addStepLog(jobId, 'save', 'completed', 60, `נשמרו ${saved} דפים`);

    // 4. RAG indexing
    await repo.addStepLog(jobId, 'rag', 'running', 65, 'מאנדקס תוכן לחיפוש AI...');

    let ragChunks = 0;
    try {
      const { ingestDocument } = await import('@/lib/rag/ingest');

      for (const page of pages) {
        if (!page.content || page.content.length < 50) continue;
        try {
          const result = await ingestDocument({
            accountId,
            entityType: 'website',
            sourceId: page.url,
            title: page.title || page.url,
            text: page.content,
            metadata: { url: page.url, imageUrls: page.imageUrls, wordCount: page.wordCount },
          });
          if (result?.chunksCreated) ragChunks += result.chunksCreated;
        } catch (e: any) {
          console.error(`[Website Scan] RAG ingest error for ${page.url}:`, e.message);
        }
      }

      await repo.addStepLog(jobId, 'rag', 'completed', 85, `נוצרו ${ragChunks} חתיכות RAG`);
    } catch (e: any) {
      console.error('[Website Scan] RAG module error:', e.message);
      await repo.addStepLog(jobId, 'rag', 'failed', 85, `שגיאה באינדוקס: ${e.message}`);
    }

    // 5. Mark succeeded
    await repo.addStepLog(jobId, 'complete', 'completed', 100, 'סריקה הושלמה בהצלחה!');
    await repo.markSucceeded(jobId, {
      pagesScraped: pages.length,
      pagesSaved: saved,
      totalWords,
      totalImages,
      ragChunksCreated: ragChunks,
      rootUrl,
      domain,
    });

    console.log(`[Website Scan] Job ${jobId} completed: ${saved} pages, ${totalWords} words`);
  } catch (error: any) {
    console.error(`[Website Scan] Processing failed for job ${jobId}:`, error.message);
    await repo.addStepLog(jobId, 'save', 'failed', 50, `שגיאה: ${error.message}`);
    await repo.markFailed(jobId, 'PROCESSING_ERROR', error.message);
  }
}
