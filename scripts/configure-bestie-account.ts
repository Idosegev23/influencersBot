/**
 * Fill in Bestie's own account properly.
 *
 * It was created with the bare minimum needed to hold a knowledge base, which
 * made every screen that renders an account look empty. Every other brand has a
 * display name, a subtitle, a greeting, starter questions and theme colours —
 * Bestie, of all accounts, should not be the one that looks unfinished.
 *
 * Colours are Bestie's real brand (brand-book/), not defaults.
 * Merges into config — never clobbers the archetype or coupons_disabled.
 *
 * Run: npx tsx scripts/configure-bestie-account.ts
 * Needs Node >= 22 (`nvm use 22`).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const BRAND = {
  purple: '#883FE2',
  purpleLight: '#B497EF',
  ink: '#17092E',
};

// Absolute, not relative: the widget config is consumed by the embed script on
// third-party sites, where a "/brand/..." path resolves against THEIR domain.
const SITE = (process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');
const ICON = `${SITE}/brand/bestie-icon.svg`;
const WORDMARK = `${SITE}/brand/bestie-wordmark.svg`;

async function main() {
  const { createClient } = await import('../src/lib/supabase/server');
  const { hashPassword } = await import('../src/lib/utils');
  const supabase = createClient();

  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, config, security_config')
    .eq('config->>username', 'bestie')
    .single();

  if (error || !account) {
    console.error('bestie account not found — run scripts/create-bestie-account.ts first');
    process.exit(1);
  }

  const config = {
    ...(account.config as any),

    // Identity
    display_name: 'Bestie',
    header_label: 'עוזרת AI לעסקים',
    chat_subtitle: 'שאלו אותי כל דבר על בסטי — מה היא עושה, איך משתמשים בה, ומה יש בכל מסך',
    greeting_message: 'היי, אני בסטי. שאלו אותי כל דבר על המערכת ואראה לכם בדיוק איפה ומה ללחוץ.',
    website_url: SITE,

    // The brand mark, finally wired up. Both keys because different screens
    // read different ones (chat page vs widget config vs admin list).
    avatar_url: ICON,
    profile_pic_url: ICON,

    theme: {
      style: 'elegant',
      darkMode: false,
      fonts: { body: 'Heebo', heading: 'Heebo' },
      colors: {
        primary: BRAND.ink,
        accent: BRAND.purple,
        text: '#0a0a0a',
        surface: '#ffffff',
        background: '#fbf8ff',
        border: '#eee9f8',
      },
    },

    widget: {
      ...((account.config as any)?.widget ?? {}),
      enabled: true,
      domain: 'bestie.ldrsgroup.com',
      position: 'bottom-right',
      primaryColor: BRAND.purple,
      coverImage: WORDMARK,
      placeholder: 'שאלו אותי על בסטי…',
      welcomeMessage:
        'היי! אני בסטי 👋 אני עונה על כל שאלה על המוצר — מה הוא עושה, למי הוא מתאים, ואיך משתמשים בו.',
      modules: { leads: { enabled: true }, support: { enabled: true }, bookings: { enabled: false } },
    },

    suggested_questions: [
      'מה בסטי עושה בעצם? 📌',
      'איפה בסטי עונה ללקוחות שלי? 📌',
      'מה צריך כדי להתחיל? 📌',
    ],

    tabs: [
      { id: 'chat', type: 'chat', label: 'צ׳אט' },
      { id: 'support', type: 'support', label: 'צריך עזרה' },
    ],
  };

  const security_config = {
    ...((account.security_config as any) ?? {}),
    admin_password_hash: await hashPassword('123456'),
  };

  const { error: upErr } = await supabase
    .from('accounts')
    .update({ config, security_config })
    .eq('id', account.id);

  if (upErr) { console.error(upErr.message); process.exit(1); }

  console.log('✅ bestie account configured');
  console.log(`   id:       ${account.id}`);
  console.log('   login:    https://bestie.ldrsgroup.com/influencer/bestie/login');
  console.log('   username: bestie');
  console.log('   password: 123456');
  console.log(`   archetype kept: ${(config as any).archetype}`);
  console.log(`   coupons_disabled kept: ${(config as any).coupons_disabled}`);
}

main().catch(e => { console.error(e); process.exit(1); });
