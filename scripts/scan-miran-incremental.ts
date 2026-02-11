/**
 * Script: Incremental scan for Miran
 * סריקה חכמה של תוכן חדש למירן
 */

import { runIncrementalScan } from '../src/lib/scraping/incrementalScanOrchestrator';

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';
const MIRAN_USERNAME = 'miranbuzaglo';

async function main() {
  console.log('🚀 Starting incremental scan for Miran...\n');

  const result = await runIncrementalScan(MIRAN_USERNAME, MIRAN_ACCOUNT_ID, {
    maxNewPosts: 30, // בדיקת 30 פוסטים אחרונים
    checkHighlights: true,
    transcribeNewReels: true,
    updateProfile: true,
  });

  if (result.success) {
    console.log('\n✅ Scan completed successfully!');
    console.log('📊 Results:');
    console.log(`   - New posts: ${result.stats.newPostsFound}`);
    console.log(`   - New highlights: ${result.stats.newHighlightsFound}`);
    console.log(`   - New highlight items: ${result.stats.newHighlightItemsFound}`);
    console.log(`   - Transcripts created: ${result.stats.transcriptsCreated}`);
    console.log(`   - Profile updated: ${result.stats.profileUpdated ? 'Yes' : 'No'}`);
    console.log(`   - Duration: ${result.duration.toFixed(2)}s`);
  } else {
    console.error('\n❌ Scan failed:', result.error);
  }
}

main().catch(console.error);
