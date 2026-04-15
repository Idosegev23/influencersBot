/**
 * One-off: refresh preprocessing_data for a specific account
 * Usage: npx tsx scripts/refresh-preproc-one.ts <account_id>
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { runPreprocessing } from '../src/lib/scraping/preprocessing';
import { createClient } from '@supabase/supabase-js';

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: npx tsx scripts/refresh-preproc-one.ts <account_id>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log(`Preprocessing ${accountId}...`);
  const result = await runPreprocessing(accountId);
  console.log('Stats:', JSON.stringify(result.stats, null, 2));

  const { error } = await supabase
    .from('chatbot_persona')
    .update({
      preprocessing_data: result,
      scrape_stats: { ...result.stats, lastUpdate: new Date().toISOString(), updateType: 'manual-refresh' },
      instagram_last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);

  if (error) { console.error('Save failed:', error); process.exit(1); }
  console.log('✓ chatbot_persona.preprocessing_data updated');
})();
