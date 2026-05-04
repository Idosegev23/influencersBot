/**
 * Persist images for ALL active creator accounts to Supabase storage.
 * Runs locally (no Vercel timeout). Uses ScrapeCreators to fetch fresh
 * post URLs, then downloads + uploads every image to the "post-media"
 * bucket. Idempotent — re-running skips already-persisted images.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/persist-all-media.ts
 *   npx tsx --tsconfig tsconfig.json scripts/persist-all-media.ts --only username1,username2
 *   npx tsx --tsconfig tsconfig.json scripts/persist-all-media.ts --limit 50
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf('--only');
  const onlyFilter = onlyIndex !== -1 ? args[onlyIndex + 1]?.split(',') : null;
  const limitIndex = args.indexOf('--limit');
  const postsPerAccount = limitIndex !== -1 ? Number(args[limitIndex + 1]) : 100;

  console.log(`\n${'🖼️'.repeat(30)}`);
  console.log(`  PERSIST MEDIA — ${postsPerAccount} posts per account`);
  if (onlyFilter) console.log(`  Filter: ${onlyFilter.join(', ')}`);
  console.log(`${'🖼️'.repeat(30)}\n`);

  const { createClient } = await import('@supabase/supabase-js');
  const { getScrapeCreatorsClient } = await import('../src/lib/scraping/scrapeCreatorsClient');
  const { persistPostMedia } = await import('../src/lib/scraping/media-storage');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('type', 'creator')
    .eq('status', 'active');

  if (error || !accounts) {
    console.error('Failed to load accounts:', error?.message);
    process.exit(1);
  }

  const { data: personas } = await supabase
    .from('chatbot_persona')
    .select('account_id, instagram_username')
    .in('account_id', accounts.map(a => a.id));

  const personaMap = new Map((personas || []).map(p => [p.account_id, p.instagram_username]));

  let list = accounts
    .map(a => ({
      id: a.id,
      username: personaMap.get(a.id) || (a.config as any)?.username || '',
    }))
    .filter(a => a.username);

  if (onlyFilter) list = list.filter(a => onlyFilter.includes(a.username));

  console.log(`📋 ${list.length} accounts to process:\n   ${list.map(a => '@' + a.username).join(', ')}\n`);

  const client = getScrapeCreatorsClient();
  const totals = { accounts: 0, posts: 0, persisted: 0, errors: 0 };
  const tStart = Date.now();

  for (let i = 0; i < list.length; i++) {
    const account = list[i];
    const accountStart = Date.now();
    console.log(`\n[${i + 1}/${list.length}] @${account.username} — fetching ${postsPerAccount} posts...`);

    try {
      const posts = await client.getPosts(account.username, postsPerAccount);
      let persistedForAcct = 0;

      for (const post of posts) {
        try {
          const persisted = await persistPostMedia(
            supabase,
            account.id,
            post.shortcode,
            post.media_urls,
            post.thumbnail_url,
          );

          await supabase.from('instagram_posts').upsert({
            account_id: account.id,
            shortcode: post.shortcode,
            post_id: post.post_id,
            post_url: post.post_url,
            type: post.media_type === 'video' ? 'reel' : post.media_type,
            caption: post.caption,
            mentions: post.mentions || [],
            media_urls: post.media_urls,
            thumbnail_url: post.thumbnail_url,
            stored_media_urls: persisted.stored_media_urls,
            stored_thumbnail_url: persisted.stored_thumbnail_url,
            media_stored_at: persisted.media_stored_at,
            likes_count: post.likes_count,
            comments_count: post.comments_count,
            views_count: post.views_count,
            posted_at: post.posted_at,
            location: post.location,
            is_sponsored: post.is_sponsored,
            scraped_at: new Date().toISOString(),
          }, { onConflict: 'account_id,shortcode' });

          if (persisted.media_stored_at) {
            persistedForAcct++;
            totals.persisted++;
          }
          totals.posts++;
        } catch (postErr: any) {
          totals.errors++;
          console.warn(`   ⚠️ ${post.shortcode}: ${postErr.message || postErr}`);
        }
      }

      const dur = ((Date.now() - accountStart) / 1000).toFixed(1);
      console.log(`   ✅ ${persistedForAcct}/${posts.length} posts persisted (${dur}s)`);
      totals.accounts++;
    } catch (err: any) {
      console.error(`   ❌ failed: ${err.message || err}`);
      totals.errors++;
    }
  }

  const total = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ DONE in ${total} min`);
  console.log(`   Accounts processed: ${totals.accounts}/${list.length}`);
  console.log(`   Posts seen: ${totals.posts}`);
  console.log(`   Images persisted: ${totals.persisted}`);
  console.log(`   Errors: ${totals.errors}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
