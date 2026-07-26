/**
 * Creates the `bestie` account — Bestie's own account, the one it never got.
 *
 * Every brand on the platform gets an account with a persona and a knowledge
 * base. Bestie cannot get one the normal way: the scan pipeline builds accounts
 * by scraping a website and an Instagram profile, and Bestie the product has
 * nothing to scrape. So it is authored instead.
 *
 * Idempotent: re-running finds the existing row by config.username and updates
 * it rather than creating a second Bestie.
 *
 * Run: npx tsx scripts/create-bestie-account.ts
 *
 * Needs Node >= 22 (`nvm use 22`). supabase-js constructs a realtime client
 * eagerly and Node 20 has no native WebSocket, so it throws before any query.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const USERNAME = 'bestie';

async function main() {
  // Imported dynamically and from supabase/server, not the shared singleton:
  // the singleton spins up a realtime client at module load, which needs a
  // native WebSocket that Node 20 does not have. Scripts don't need realtime.
  const { createClient } = await import('../src/lib/supabase/server');
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('config->>username', USERNAME)
    .maybeSingle();

  const config = {
    username: USERNAME,
    display_name: 'Bestie',
    archetype: 'saas_product',
    // Bestie sells a product, not discounts. Without this the coupon paths
    // would happily invent one, and an invented coupon is an obligation.
    coupons_disabled: true,
    // Deliberately empty: nothing to scan. This is what keeps the daily scan
    // crons from picking the account up.
    sources: {},
  };

  let accountId: string;

  if (existing) {
    const { data, error } = await supabase
      .from('accounts')
      .update({ config })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    accountId = data.id;
    console.error('updated existing bestie account');
  } else {
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        type: 'creator', // accounts_type_check allows only 'creator' | 'brand'
        status: 'active',
        language: 'he',
        timezone: 'Asia/Jerusalem',
        config,
      })
      .select('id')
      .single();
    if (error) throw error;
    accountId = data.id;
    console.error('created bestie account');
  }

  const { error: personaError } = await supabase.from('chatbot_persona').upsert(
    {
      account_id: accountId,
      name: 'בסטי',
      language: 'he',
      tone: 'ידידותית, ישירה, בלי פלצנות',
      bio: 'בסטי — עוזרת AI שעונה ללקוחות של עסקים בוואטסאפ, באינסטגרם ובאתר.',
      description:
        'אני בסטי. אני עונה על שאלות על בסטי עצמה: מה היא עושה, למי היא מתאימה, ' +
        'כמה היא עולה, ואיך משתמשים בה — באיזה מסך ואיזה כפתור.',
      // jsonb, not text — the boundary is structured so the prompt builder can
      // read the parts separately instead of pattern-matching a sentence.
      boundaries: {
        answers_about: ['bestie'],
        never_answers_about: [
          'other customers or their data',
          'how the system is built internally',
        ],
        on_unknown: 'say so plainly and offer to connect a person',
        never_invent: ['prices', 'coupons', 'promotions'],
      },
      response_style: 'קצר, קונקרטי, עם הפניה מדויקת למסך ולכפתור כשרלוונטי.',
      emoji_usage: 'minimal',            // CHECK: none|minimal|moderate|heavy
      message_structure: 'whatsapp',     // CHECK: whatsapp|formal|chat
      narrative_perspective: 'direct',   // CHECK: sidekick-professional|sidekick-personal|direct
      storytelling_mode: 'concise',      // CHECK: anecdotal|concise|balanced
      sass_level: 3,                     // CHECK: 0..10
    },
    { onConflict: 'account_id' }
  );
  if (personaError) throw personaError;

  console.log(accountId);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
