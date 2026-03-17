/**
 * Full Instagram scan via Graph API → Transcription → Persona → RAG
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/scan-account-graph-api.ts <accountId>
 *
 * Requires an active ig_graph_connections entry for the account.
 * Uses official Graph API instead of ScrapeCreators — gets posts, stories, comments.
 * Then runs the standard processing pipeline (transcription, coupons, RAG, persona).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

// ============================================
// Graph API helpers (inline to avoid Next.js imports)
// ============================================

const GRAPH_API_BASE = 'https://graph.instagram.com/v22.0';

async function graphGet<T>(url: string, token: string): Promise<T> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}access_token=${token}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Unknown' } }));
    throw new Error(`Graph API: ${err?.error?.message || res.status}`);
  }
  return res.json() as Promise<T>;
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================
// Main
// ============================================

async function main() {
  const accountId = process.argv[2];
  if (!accountId) {
    console.error('Usage: npx tsx --tsconfig tsconfig.json scripts/scan-account-graph-api.ts <accountId>');
    process.exit(1);
  }

  const startTime = Date.now();

  // 1. Get Graph API connection
  console.log('\n' + '='.repeat(60));
  console.log('🔑 Step 1: Resolving Instagram Graph API connection...');

  const { data: conn, error: connErr } = await supabase
    .from('ig_graph_connections')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .single();

  if (connErr || !conn) {
    console.error('❌ No active Graph API connection for this account');
    process.exit(1);
  }

  const token = conn.access_token;
  const igUserId = conn.ig_business_account_id;
  console.log(`   ✅ Connected: @${conn.ig_username} (${igUserId})`);

  // Check token expiry
  if (conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at);
    const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000);
    console.log(`   Token expires: ${expiresAt.toISOString()} (${daysLeft} days left)`);
    if (daysLeft < 0) {
      console.error('❌ Token expired! Refresh needed.');
      process.exit(1);
    }
  }

  // Get account info
  const { data: account } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('id', accountId)
    .single();

  const username = conn.ig_username;

  // 2. Fetch profile
  console.log('\n👤 Step 2: Fetching profile...');
  const profile = await graphGet<any>(
    `${GRAPH_API_BASE}/${igUserId}?fields=id,name,username,biography,followers_count,media_count,profile_picture_url,website`,
    token
  );
  console.log(`   ${profile.name} | ${profile.followers_count} followers | ${profile.media_count} posts`);

  // Save profile snapshot
  await supabase.from('instagram_profile_history').insert({
    account_id: accountId,
    username: profile.username,
    full_name: profile.name,
    bio: profile.biography,
    followers_count: profile.followers_count,
    posts_count: profile.media_count,
    profile_pic_url: profile.profile_picture_url,
    is_business_account: true,
    snapshot_date: new Date().toISOString(),
  });

  // 3. Fetch ALL media (posts/reels)
  console.log('\n📸 Step 3: Fetching all media...');
  const allMedia: any[] = [];
  let nextUrl: string | null = `${GRAPH_API_BASE}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=25`;

  while (nextUrl) {
    const page = await graphGet<{ data: any[]; paging?: { next?: string } }>(nextUrl, token);
    allMedia.push(...(page.data || []));
    nextUrl = page.paging?.next || null;
    console.log(`   Fetched ${allMedia.length} media items...`);
    if (nextUrl) await delay(500);
  }
  console.log(`   ✅ Total: ${allMedia.length} media items`);

  // 4. Save posts to DB
  console.log('\n💾 Step 4: Saving posts to database...');
  let savedCount = 0;
  let videoCount = 0;
  let carouselCount = 0;

  for (const media of allMedia) {
    // Extract shortcode from permalink
    const shortcodeMatch = media.permalink?.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    const shortcode = shortcodeMatch?.[1] || media.id;

    // Map media type
    let type = 'post';
    if (media.media_type === 'VIDEO') { type = 'reel'; videoCount++; }
    if (media.media_type === 'CAROUSEL_ALBUM') { type = 'carousel'; carouselCount++; }

    // For carousels, fetch children to get all media URLs
    let mediaUrls = media.media_url ? [media.media_url] : [];
    if (media.media_type === 'CAROUSEL_ALBUM') {
      try {
        const children = await graphGet<{ data: any[] }>(
          `${GRAPH_API_BASE}/${media.id}/children?fields=id,media_type,media_url`,
          token
        );
        mediaUrls = (children.data || []).map((c: any) => c.media_url).filter(Boolean);
        await delay(300);
      } catch (e: any) {
        console.warn(`   ⚠️ Failed to get carousel children for ${media.id}: ${e.message}`);
      }
    }

    // Extract mentions from caption
    const mentions = (media.caption || '').match(/@([a-zA-Z0-9_.]+)/g)?.map((m: string) => m.slice(1)) || [];

    // Extract hashtags from caption
    const hashtags = (media.caption || '').match(/#([^\s#]+)/g)?.map((h: string) => h.slice(1)) || [];

    // Upsert to DB
    const { error: insertErr } = await supabase
      .from('instagram_posts')
      .upsert({
        account_id: accountId,
        post_id: media.id,
        shortcode,
        post_url: media.permalink,
        type,
        caption: media.caption || null,
        hashtags: hashtags.length > 0 ? hashtags : null,
        mentions: mentions.length > 0 ? mentions : null,
        media_urls: mediaUrls,
        thumbnail_url: media.thumbnail_url || null,
        likes_count: media.like_count || 0,
        comments_count: media.comments_count || 0,
        posted_at: media.timestamp,
        scraped_at: new Date().toISOString(),
        is_sponsored: false,
      }, { onConflict: 'account_id,shortcode' });

    if (insertErr && !insertErr.message.includes('duplicate')) {
      console.warn(`   ⚠️ Insert failed for ${media.id}: ${insertErr.message}`);
    }
    savedCount++;
  }
  console.log(`   ✅ Saved ${savedCount} posts (${videoCount} videos, ${carouselCount} carousels)`);

  // 5. Fetch comments for posts with comments
  console.log('\n💬 Step 5: Fetching comments...');
  const postsWithComments = allMedia.filter(m => (m.comments_count || 0) > 0);
  let totalComments = 0;

  // Get post UUIDs from DB for foreign key
  const { data: dbPosts } = await supabase
    .from('instagram_posts')
    .select('id, post_id')
    .eq('account_id', accountId);
  const postIdMap = new Map((dbPosts || []).map(p => [p.post_id, p.id]));

  for (const media of postsWithComments.slice(0, 50)) { // Limit to 50 posts
    try {
      const comments = await graphGet<{ data: any[] }>(
        `${GRAPH_API_BASE}/${media.id}/comments?fields=id,text,username,timestamp,like_count&limit=25`,
        token
      );

      const dbPostId = postIdMap.get(media.id);
      if (!dbPostId || !comments.data) continue;

      for (const comment of comments.data) {
        await supabase.from('instagram_comments').upsert({
          post_id: dbPostId,
          account_id: accountId,
          comment_id: comment.id,
          text: comment.text,
          author_username: comment.username,
          is_owner_reply: comment.username === username,
          likes_count: comment.like_count || 0,
          commented_at: comment.timestamp,
          scraped_at: new Date().toISOString(),
        }, { onConflict: 'post_id,comment_id' });
        totalComments++;
      }
      await delay(300);
    } catch (e: any) {
      // Some posts may not allow comment reading
      if (!e.message.includes('Cannot query')) {
        console.warn(`   ⚠️ Comments failed for ${media.id}: ${e.message}`);
      }
    }
  }
  console.log(`   ✅ Saved ${totalComments} comments from ${postsWithComments.length} posts`);

  // 6. Fetch active stories
  console.log('\n📱 Step 6: Fetching active stories...');
  try {
    const stories = await graphGet<{ data: any[] }>(
      `${GRAPH_API_BASE}/${igUserId}/stories?fields=id,media_type,media_url,timestamp`,
      token
    );

    const storyData = stories.data || [];
    console.log(`   Found ${storyData.length} active stories`);

    for (const story of storyData) {
      const mediaType = story.media_type === 'VIDEO' ? 'video' : 'image';
      const expiresAt = new Date(new Date(story.timestamp).getTime() + 24 * 60 * 60 * 1000);

      await supabase.from('instagram_stories').upsert({
        account_id: accountId,
        story_id: story.id,
        media_type: mediaType,
        media_url: story.media_url,
        posted_at: story.timestamp,
        expires_at: expiresAt.toISOString(),
        scraped_at: new Date().toISOString(),
        transcription_status: mediaType === 'video' ? 'pending' : 'pending',
      }, { onConflict: 'account_id,story_id' });

      // Try to get story insights
      try {
        const insights = await graphGet<{ data: any[] }>(
          `${GRAPH_API_BASE}/${story.id}/insights?metric=impressions,reach,replies`,
          token
        );
        const insightData: any = {};
        for (const m of (insights.data || [])) {
          insightData[m.name] = m.values?.[0]?.value || 0;
        }
        console.log(`   Story ${story.id}: ${insightData.impressions || 0} impressions, ${insightData.reach || 0} reach`);
      } catch {
        // Insights may not be available for all stories
      }
    }
    console.log(`   ✅ Saved ${storyData.length} stories`);
  } catch (e: any) {
    console.warn(`   ⚠️ Stories fetch failed: ${e.message}`);
  }

  // 7. Update account last_scraped
  console.log('\n📊 Step 7: Updating account metadata...');
  await supabase
    .from('accounts')
    .update({
      last_scraped: new Date().toISOString(),
      scan_status: 'completed',
    })
    .eq('id', accountId);

  const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Scan phase complete in ${scanTime}s`);

  // 8. Run content processing pipeline
  console.log('\n🔧 Step 8: Processing content (transcription + coupons + RAG + persona)...');
  console.log('   This may take several minutes...\n');

  try {
    const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
    const result = await processAccountContent({
      accountId,
      transcribeVideos: true,
      maxVideosToTranscribe: 999,
      buildRagIndex: true,
      buildPersona: true,
      priority: 'high',
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ @${username} — Full Graph API scan completed in ${totalTime}s`);
    console.log(`   Posts: ${savedCount} (${videoCount} videos, ${carouselCount} carousels)`);
    console.log(`   Comments: ${totalComments}`);
    console.log(`   Videos transcribed: ${result.stats.videosTranscribed}`);
    console.log(`   Persona built: ${result.stats.personaBuilt}`);
    console.log(`   RAG documents: ${result.stats.ragDocumentsIngested}`);
    if (result.errors.length > 0) {
      console.log(`   ⚠️ Errors: ${result.errors.length}`);
      for (const err of result.errors.slice(0, 10)) {
        console.log(`      - ${err}`);
      }
    }
    console.log('='.repeat(60) + '\n');
  } catch (e: any) {
    console.error(`\n❌ Content processing failed: ${e.message}`);
    console.error('   The scan data was saved successfully — you can re-run processing later.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
