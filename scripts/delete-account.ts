/**
 * Delete an account and all its data
 * Usage: npx tsx scripts/delete-account.ts <account_id>
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ACCOUNT_ID = process.argv[2];
if (!ACCOUNT_ID) {
  console.error('Usage: npx tsx scripts/delete-account.ts <account_id>');
  process.exit(1);
}

async function main() {
  console.log(`🗑️  Deleting account ${ACCOUNT_ID}...\n`);

  const tables = [
    'document_chunks',
    'documents',
    'chatbot_messages_v2',
    'chatbot_conversations_v2',
    'chat_messages',
    'chat_sessions',
    'instagram_posts',
    'instagram_comments',
    'instagram_transcriptions',
    'instagram_highlights',
    'instagram_profile_history',
    'instagram_bio_websites',
    'chatbot_knowledge_base',
    'chatbot_persona',
    'partnerships',
    'coupons',
    'conversation_insights',
    'conversation_analysis_runs',
    'scan_jobs',
    'support_requests',
  ];

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('account_id', ACCOUNT_ID);

    if (error && !error.message.includes('does not exist')) {
      console.log(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: ${count ?? 0} rows deleted`);
    }
  }

  // Delete account itself
  const { error, count } = await supabase
    .from('accounts')
    .delete({ count: 'exact' })
    .eq('id', ACCOUNT_ID);

  if (error) {
    console.log(`\n  ❌ accounts: ${error.message}`);
  } else {
    console.log(`\n  ✅ accounts: ${count ?? 0} deleted`);
  }

  console.log('\nDone');
}

main().catch(err => { console.error(err); process.exit(1); });
