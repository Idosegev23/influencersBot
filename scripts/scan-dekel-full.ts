#!/usr/bin/env npx tsx
/**
 * Full Quality Scan for the_dekel
 * סריקה מלאה ואיכותית של the_dekel מאינסטגרם
 */

// ⚡ CRITICAL: Load .env BEFORE any other imports!
import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(__dirname, '../.env');
console.log(`📁 Loading environment from: ${envPath}`);
const envResult = config({ path: envPath });
if (envResult.error) {
  console.error('❌ Failed to load .env:', envResult.error);
  process.exit(1);
}
console.log(`✅ Loaded ${Object.keys(envResult.parsed || {}).length} environment variables`);
console.log(`🔑 SCRAPECREATORS_API_KEY: ${process.env.SCRAPECREATORS_API_KEY ? '✅ Found' : '❌ Missing'}\n`);

import { NewScanOrchestrator, DEFAULT_SCAN_CONFIG } from '../src/lib/scraping/newScanOrchestrator';
import { randomUUID } from 'crypto';

const DEKEL_ACCOUNT_ID = 'e5a5076a-faaf-4e67-8bdd-61c15153fb20';
const DEKEL_USERNAME = 'the_dekel';

// ⚡ Quality scan configuration - get MORE content!
const QUALITY_CONFIG = {
  postsLimit: 100,              // ⬆️ 100 פוסטים (instead of 50)
  commentsPerPost: 5,           // ⬆️ 5 תגובות לכל פוסט (instead of 3)
  maxWebsitePages: 15,          // ⬆️ 15 דפי אתרים (instead of 10)
  samplesPerHighlight: 999,     // ✅ All highlight items
  transcribeReels: true,        // ✅ Full transcription + OCR
};

async function main() {
  console.log('🚀 Starting FULL QUALITY SCAN for the_dekel...\n');
  console.log('📊 Scan Configuration:');
  console.log(`   - Posts Limit: ${QUALITY_CONFIG.postsLimit}`);
  console.log(`   - Comments Per Post: ${QUALITY_CONFIG.commentsPerPost}`);
  console.log(`   - Max Website Pages: ${QUALITY_CONFIG.maxWebsitePages}`);
  console.log(`   - Samples Per Highlight: ${QUALITY_CONFIG.samplesPerHighlight} (ALL)`);
  console.log(`   - Transcribe Reels: ${QUALITY_CONFIG.transcribeReels ? '✅ YES' : '❌ NO'}`);
  console.log('');

  // Validate environment
  if (!process.env.SCRAPECREATORS_API_KEY) {
    throw new Error('❌ SCRAPECREATORS_API_KEY is not configured in .env');
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not found - transcription will be skipped');
  }

  const jobId = randomUUID();
  const orchestrator = new NewScanOrchestrator();

  // Progress callback
  const onProgress = (step: string, status: string, progress: number, message: string) => {
    const emoji = status === 'completed' ? '✅' : status === 'running' ? '🔄' : status === 'failed' ? '❌' : '⏳';
    console.log(`${emoji} [${progress}%] ${step}: ${message}`);
  };

  try {
    console.log(`🎯 Starting scan for @${DEKEL_USERNAME}...\n`);
    
    const result = await orchestrator.run(
      jobId,
      DEKEL_USERNAME,
      DEKEL_ACCOUNT_ID,
      QUALITY_CONFIG,
      onProgress
    );

    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅ SCAN COMPLETED SUCCESSFULLY!\n');
      console.log('📊 Final Statistics:');
      console.log(`   - Profile Scraped: ${result.stats.profileScraped ? '✅' : '❌'}`);
      console.log(`   - Posts: ${result.stats.postsCount}`);
      console.log(`   - Comments: ${result.stats.commentsCount}`);
      console.log(`   - Highlights: ${result.stats.highlightsCount}`);
      console.log(`   - Highlight Items: ${result.stats.highlightItemsCount}`);
      console.log(`   - Transcriptions: ${result.stats.transcriptsCount}`);
      console.log(`   - Websites Crawled: ${result.stats.websitesCrawled}`);
      console.log(`   - Website Pages: ${result.stats.websitePagesCount}`);
      console.log(`   - Duration: ${(result.duration / 1000).toFixed(2)}s`);
    } else {
      console.log('❌ SCAN FAILED!\n');
      if (result.error) {
        console.log(`Error Code: ${result.error.code}`);
        console.log(`Message: ${result.error.message}`);
        console.log(`Retryable: ${result.error.retryable ? 'Yes' : 'No'}`);
      }
    }
    console.log('='.repeat(60) + '\n');

    // Now sync to knowledge base
    if (result.success && result.stats.highlightsCount > 0) {
      console.log('🔄 Syncing to knowledge base...');
      
      try {
        // Import knowledge sync
        const { syncKnowledgeBase } = await import('../src/lib/chatbot/knowledge-sync');
        await syncKnowledgeBase(DEKEL_ACCOUNT_ID);
        console.log('✅ Knowledge base synced successfully!');
      } catch (syncError: any) {
        console.error('⚠️  Knowledge base sync failed:', syncError.message);
        console.log('   You may need to sync manually later.');
      }
    }

    process.exit(result.success ? 0 : 1);

  } catch (error: any) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
