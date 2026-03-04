/**
 * Start a website scan — kicks off Apify crawl and returns immediately.
 * The status endpoint handles polling Apify + processing results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const WEBSITE_CRAWLER_ACTOR = 'apify/website-content-crawler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, accountId, maxPages = 50 } = body;

    if (!url || !accountId) {
      return NextResponse.json(
        { error: 'url and accountId are required' },
        { status: 400 },
      );
    }

    // Validate URL format
    let validatedUrl: string;
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 });
      }
      validatedUrl = parsed.href;
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    if (!APIFY_TOKEN) {
      return NextResponse.json({ error: 'APIFY_TOKEN is not configured' }, { status: 500 });
    }

    const repo = getScanJobsRepo();

    // Check for running jobs on same account
    const recentJobs = await repo.getByAccount(accountId, 5);
    const runningJob = recentJobs.find(
      (j) => j.platform === 'website' && j.status === 'running',
    );
    if (runningJob) {
      const updatedAt = new Date(runningJob.updated_at || runningJob.started_at || 0).getTime();
      const staleThreshold = 10 * 60 * 1000;
      if (Date.now() - updatedAt > staleThreshold) {
        console.log(`[Website Scan] Auto-cancelling stale job ${runningJob.id}`);
        await repo.cancel(runningJob.id);
      } else {
        return NextResponse.json(
          { error: 'A website scan is already running for this account', jobId: runningJob.id },
          { status: 409 },
        );
      }
    }

    // Create job
    const domain = new URL(validatedUrl).hostname;
    const job = await repo.create({
      platform: 'website',
      username: domain,
      account_id: accountId,
      config: { url: validatedUrl, maxPages },
    });

    // Start Apify run (just the API call — fast, <5s)
    try {
      const encodedActorId = WEBSITE_CRAWLER_ACTOR.replace('/', '~');
      const apifyUrl = `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${APIFY_TOKEN}`;

      const apifyRes = await fetch(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: validatedUrl }],
          maxCrawlPages: maxPages,
          maxCrawlDepth: 3,
          crawlerType: 'playwright:adaptive',
          globs: [{ glob: `https://${domain}/**` }, { glob: `http://${domain}/**` }],
          htmlTransformer: 'readableText',
          removeElementsCssSelector: 'nav, footer, header, .cookie-banner, .popup, #cookie-consent',
          saveScreenshots: false,
          saveHtml: false,
          saveMarkdown: true,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!apifyRes.ok) {
        const errorBody = await apifyRes.text();
        console.error('[Website Scan] Apify start error:', errorBody);
        await repo.markFailed(job.id, 'APIFY_START_ERROR', `Apify error: ${apifyRes.status}`);
        return NextResponse.json({ error: `Failed to start crawl: ${apifyRes.status}` }, { status: 502 });
      }

      const apifyData = await apifyRes.json();
      const runId = apifyData.data.id;
      const datasetId = apifyData.data.defaultDatasetId;

      console.log(`[Website Scan] Apify run started: ${runId}, dataset: ${datasetId}`);

      // Save runId and datasetId to job config so status endpoint can poll
      await repo.markRunning(job.id, 'apify-crawler');
      await repo.addStepLog(job.id, 'validate', 'completed', 10, 'URL תקין');
      await repo.addStepLog(job.id, 'crawl', 'running', 15, 'מתחיל סריקה...');

      // Update job config with Apify run info
      const supabase = await (await import('@/lib/supabase/server')).createClient();
      await supabase
        .from('scan_jobs')
        .update({
          config: { url: validatedUrl, maxPages, apifyRunId: runId, apifyDatasetId: datasetId },
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return NextResponse.json({
        jobId: job.id,
        status: 'running',
        message: `Started scanning ${validatedUrl}`,
      });
    } catch (error: any) {
      console.error('[Website Scan] Start error:', error.message);
      await repo.markFailed(job.id, 'START_ERROR', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Website Scan Start] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
