#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Generate tab config for all accounts based on RAG data + archetype + influencer_type.
 * Saves to accounts.config.tabs, config.chat_subtitle, config.header_label, config.greeting_message
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/generate-tab-config.ts [--dry-run]
 *   npx tsx --tsconfig tsconfig.json scripts/generate-tab-config.ts <account_id>
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { generateTabConfig } from '@/lib/chat-ui/generate-tab-config';
import { createClient } from '@/lib/supabase/server';

const supabase = createClient();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const args = process.argv.slice(2);
  const specificId = args.find(a => !a.startsWith('--') && a.match(/^[0-9a-f]{8}-/));

  if (specificId) {
    // Single account
    console.log(`Generating tab config for ${specificId}...`);
    const result = await generateTabConfig(specificId);
    console.log(`  Tabs: ${result.tabs.map(t => t.label).join(' | ')}`);
    console.log(`  Subtitle: ${result.chat_subtitle}`);
    console.log(`  Header: ${result.header_label}`);
    console.log(`  Greeting: ${result.greeting_message}`);
    return;
  }

  // All accounts
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active');

  if (error || !accounts) {
    console.error('Failed to fetch accounts:', error);
    process.exit(1);
  }

  console.log(`${dryRun ? '--- DRY RUN ---\n' : ''}Processing ${accounts.length} accounts...\n`);

  for (const acc of accounts) {
    const username = acc.config?.username || acc.id;
    const archetype = acc.config?.archetype || 'influencer';
    const itype = acc.config?.influencer_type || 'other';

    try {
      if (dryRun) {
        console.log(`${username} (${archetype}/${itype}): [dry run — skipped]`);
        continue;
      }

      const result = await generateTabConfig(acc.id);
      console.log(`${username} (${archetype}/${itype}):`);
      console.log(`  ${result.tabs.map(t => t.label).join(' | ')}`);
      console.log(`  "${result.greeting_message}"`);
    } catch (err: any) {
      console.error(`${username}: ERROR — ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
