/**
 * Rebuild persona + chat config using the full orchestrator pipeline.
 * Skips transcription (already done), runs: preprocess → coupon extract → RAG → persona → chat config → commerce sync
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/rebuild-persona-orchestrator.ts <account_id>
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

async function main() {
  const accountId = process.argv[2];
  if (!accountId) {
    console.error('Usage: npx tsx --tsconfig tsconfig.json scripts/rebuild-persona-orchestrator.ts <account_id>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 Rebuilding persona via orchestrator for ${accountId}`);
  console.log(`   Skips transcription, runs: preprocess → coupons → RAG → persona → chat config → commerce sync`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // Dynamic import to resolve @/ path aliases
  const { buildAccountPersona } = await import('../src/lib/processing/content-processor-orchestrator');

  const result = await buildAccountPersona(accountId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${result.success ? '✅' : '⚠️'} Persona rebuild ${result.success ? 'complete' : 'finished with errors'} in ${elapsed}s`);
  console.log(`   Persona built: ${result.stats.personaBuilt}`);
  console.log(`   RAG documents: ${result.stats.ragDocumentsIngested}`);
  if (result.errors.length > 0) {
    console.log(`   Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`     - ${err}`);
    }
  }
  console.log(`${'='.repeat(60)}\n`);

  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
