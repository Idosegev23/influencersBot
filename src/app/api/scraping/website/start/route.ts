/**
 * POST /api/scraping/website/start
 *
 * DEPRECATED: Website scraping is now done locally using the
 * `scripts/deep-scrape-website.mjs` script (cheerio-based, runs on local machine).
 *
 * This endpoint previously kicked off an Apify website-content-crawler run.
 * It now returns a 410 Gone response directing callers to use the local script instead.
 *
 * Usage (local):
 *   node scripts/deep-scrape-website.mjs --url https://example.com --account-id <uuid>
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: 'Website scraping via Apify has been deprecated.',
      message: 'Use the local deep-scrape script instead: node scripts/deep-scrape-website.mjs --url <url> --account-id <uuid>',
    },
    { status: 410 },
  );
}
