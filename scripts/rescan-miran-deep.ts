/**
 * Deep Rescan Script for Miran Buzaglo
 * Runs a comprehensive scrape: 150 posts + highlights + 30 transcriptions
 * 
 * Usage:
 *   npx tsx scripts/rescan-miran-deep.ts
 */

import { runInfluencerScrapeOrchestration, ScrapeProgress } from '../src/lib/scraping/influencer-scrape-orchestrator';

const USERNAME = 'miranbuzaglo';
const ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 Deep Rescan: @${USERNAME}`);
  console.log(`📊 Target: 150 posts, all highlights, 30 transcriptions`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    const result = await runInfluencerScrapeOrchestration(
      USERNAME,
      ACCOUNT_ID,
      {
        scrapeHighlights: true,
        scrapeStories: true,
        scrapePosts: true,
        scrapeComments: true,
        scrapeBioWebsites: false, // Skip websites for speed
        scrapeReels: true,
        
        postsLimit: 150, // Deep scrape!
        commentsPerPost: 3,
        maxWebsitePages: 0,
        
        transcribeVideos: true,
        processWithGemini: true,
      },
      (progress: ScrapeProgress) => {
        // Log progress
        const emoji = progress.status === 'completed' ? '✅' : 
                     progress.status === 'failed' ? '❌' : 
                     progress.status === 'running' ? '⏳' : '⏸️';
        console.log(`${emoji} [${progress.progress}%] ${progress.step}: ${progress.message}`);
      }
    );

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    if (result.success) {
      console.log(`✅ Deep rescan completed in ${duration} minutes!`);
      console.log(`\n📊 Stats:`);
      console.log(`   - Highlights: ${result.stats.highlightsSaved} (${result.stats.highlightItemsSaved} items)`);
      console.log(`   - Posts: ${result.stats.postsSaved}`);
      console.log(`   - Comments: ${result.stats.commentsSaved}`);
      console.log(`   - Transcriptions: ${result.stats.videosTranscribed}`);
      console.log(`   - Data processed: ${result.stats.dataProcessed ? 'Yes' : 'No'}`);
    } else {
      console.error(`❌ Deep rescan failed after ${duration} minutes`);
      console.error(`Error: ${result.error}`);
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
