/**
 * Deep Rescan Script for Miran Buzaglo
 * Runs a comprehensive scrape: 150 posts + highlights + 30 transcriptions
 * Using ScrapeCreators API (not Apify)
 * 
 * Usage:
 *   npx tsx scripts/rescan-miran-deep.ts
 */

import { runScanJob } from '../src/lib/scraping/newScanOrchestrator';
import { randomUUID } from 'crypto';

const USERNAME = 'miranbuzaglo';
const ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 Deep Rescan: @${USERNAME}`);
  console.log(`📊 Target: 150 posts, all highlights, 30 transcriptions`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();
  const jobId = randomUUID();

  try {
    const result = await runScanJob(
      jobId,
      USERNAME,
      ACCOUNT_ID,
      {
        postsLimit: 150, // Deep scrape!
        commentsPerPost: 3,
        maxWebsitePages: 0, // Skip websites for speed
        samplesPerHighlight: 999, // Get ALL items from highlights
        transcribeReels: true,
      },
      (step: string, status: 'pending' | 'running' | 'completed' | 'failed', progress: number, message: string) => {
        // Log progress
        const emoji = status === 'completed' ? '✅' : 
                     status === 'failed' ? '❌' : 
                     status === 'running' ? '⏳' : '⏸️';
        console.log(`${emoji} [${progress}%] ${step}: ${message}`);
      }
    );

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    if (result.success) {
      console.log(`✅ Deep rescan completed in ${duration} minutes!`);
      console.log(`\n📊 Stats:`);
      console.log(`   - Profile: ${result.stats.profileScraped ? 'Scraped' : 'Failed'}`);
      console.log(`   - Posts: ${result.stats.postsCount}`);
      console.log(`   - Comments: ${result.stats.commentsCount}`);
      console.log(`   - Highlights: ${result.stats.highlightsCount} (${result.stats.highlightItemsCount} items)`);
      console.log(`   - Websites: ${result.stats.websitesCrawled} (${result.stats.websitePagesCount} pages)`);
      console.log(`   - Transcripts: ${result.stats.transcriptsCount}`);
    } else {
      console.error(`❌ Deep rescan failed after ${duration} minutes`);
      console.error(`Error: ${result.error?.message}`);
      process.exit(1);
    }
    console.log(`${'='.repeat(80)}\n`);

  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.error(`\n❌ Script failed after ${duration} minutes:`, error.message);
    process.exit(1);
  }
}

main();
