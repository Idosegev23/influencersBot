#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Repair / regenerate the chat-facing config for a single account.
 *
 * Re-runs the two canonical config generators in the correct order:
 *   1. generateChatConfig  — influencer_type, theme, suggested_questions, display_name, avatar
 *   2. generateTabConfig   — tabs, header_label, chat_subtitle, greeting_message (authority)
 *
 * Use when an account's config.tabs / greeting / theme are missing or wrong
 * (e.g. after the setup-account.ts step-2 config-wipe race — see LA BEAUTÉ /
 * Biopeptix). Identity fields (username, display_name, archetype, website_url)
 * must already be present in config before running this.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/repair-account-config.ts <account_id>
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { generateAndSaveChatConfig } from '@/lib/processing/generate-chat-config';
import { generateTabConfig } from '@/lib/chat-ui/generate-tab-config';

async function main() {
  const accountId = process.argv[2];
  if (!accountId || !/^[0-9a-f]{8}-/.test(accountId)) {
    console.error('Usage: npx tsx --tsconfig tsconfig.json scripts/repair-account-config.ts <account_id>');
    process.exit(1);
  }

  console.log(`\n🔧 Repairing config for ${accountId}\n`);

  console.log('1/2 generateChatConfig (theme, type, suggested questions)...');
  const chat = await generateAndSaveChatConfig(accountId);
  console.log(`    type=${chat.influencerType}, ${chat.questions.length} questions`);

  console.log('2/2 generateTabConfig (tabs, header, subtitle, greeting)...');
  const tabs = await generateTabConfig(accountId);
  console.log(`    Tabs:     ${tabs.tabs.map((t) => t.label).join(' | ')}`);
  console.log(`    Header:   ${tabs.header_label}`);
  console.log(`    Subtitle: ${tabs.chat_subtitle}`);
  console.log(`    Greeting: ${tabs.greeting_message}`);

  console.log('\n✅ Config repaired.\n');
}

main().catch((err) => {
  console.error('❌ Repair failed:', err);
  process.exit(1);
});
