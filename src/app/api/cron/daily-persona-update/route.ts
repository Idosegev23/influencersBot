/**
 * GET /api/cron/daily-persona-update
 * עדכון יומי מהיר של פרסונות (< 2 דקות)
 * רק פוסטים חדשים - לא rebuild מלא
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstagramActorManager } from '@/lib/scraping/apify-actors';
import { runPreprocessing } from '@/lib/scraping/preprocessing';

// Vercel timeout: 300 seconds (5 דקות) - יותר מספיק
export const maxDuration = 300;

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // 1. בדיקת Cron Secret
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
      console.error('[Daily Update] Unauthorized cron access attempt');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[Daily Update] Starting daily persona update...');

    const supabase = await createClient();
    const results = [];

    // 2. מציאת accounts שצריכים עדכון (לא עודכנו ב-24 שעות)
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, username, instagram_username')
      .not('instagram_username', 'is', null);

    if (accountsError || !accounts) {
      console.error('[Daily Update] Error loading accounts:', accountsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to load accounts',
      });
    }

    console.log(`[Daily Update] Found ${accounts.length} accounts to check`);

    // 3. עדכון כל account
    for (const account of accounts) {
      const accountStartTime = Date.now();
      const username = account.instagram_username || account.username;

      try {
        console.log(`[Daily Update] Checking @${username}...`);

        // Check if needs update
        const { data: persona } = await supabase
          .from('chatbot_persona')
          .select('instagram_last_synced')
          .eq('account_id', account.id)
          .single();

        const lastSynced = persona?.instagram_last_synced;
        const hoursSinceSync = lastSynced
          ? (Date.now() - new Date(lastSynced).getTime()) / (1000 * 60 * 60)
          : 999;

        if (hoursSinceSync < 24) {
          console.log(`[Daily Update] @${username} - skipped (last synced ${Math.round(hoursSinceSync)}h ago)`);
          results.push({
            accountId: account.id,
            username,
            status: 'skipped',
            reason: 'עדכן פחות מ-24 שעות',
          });
          continue;
        }

        // Get last post date
        const { data: lastPost } = await supabase
          .from('instagram_posts')
          .select('posted_at')
          .eq('account_id', account.id)
          .order('posted_at', { ascending: false })
          .limit(1)
          .single();

        const lastPostDate = lastPost?.posted_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Quick check for new posts (only last 50)
        const manager = new InstagramActorManager(username);
        const newPosts = await quickCheckNewPosts(manager, lastPostDate);

        console.log(`[Daily Update] @${username} - found ${newPosts.length} new posts`);

        if (newPosts.length < 3) {
          // Not enough new posts, just update timestamp
          await supabase
            .from('chatbot_persona')
            .update({ instagram_last_synced: new Date().toISOString() })
            .eq('account_id', account.id);

          results.push({
            accountId: account.id,
            username,
            status: 'skipped',
            reason: `רק ${newPosts.length} פוסטים חדשים`,
          });
          continue;
        }

        // Save new posts
        await saveNewPosts(supabase, account.id, newPosts);

        // Quick preprocessing on new data
        const preprocessed = await runPreprocessing(account.id);

        // Update persona incrementally (light update, not full rebuild)
        await updatePersonaIncrementally(supabase, account.id, preprocessed);

        const duration = Math.round((Date.now() - accountStartTime) / 1000);

        results.push({
          accountId: account.id,
          username,
          status: 'updated',
          newPosts: newPosts.length,
          duration,
        });

        console.log(`[Daily Update] @${username} - updated successfully (${duration}s)`);

      } catch (error: any) {
        console.error(`[Daily Update] Failed to update @${username}:`, error);
        results.push({
          accountId: account.id,
          username,
          status: 'failed',
          error: error.message,
        });
      }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[Daily Update] Complete in ${totalDuration}s`);
    console.log(`[Daily Update] Results:`, {
      total: results.length,
      updated: results.filter(r => r.status === 'updated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
    });

    return NextResponse.json({
      success: true,
      accountsProcessed: accounts.length,
      duration: totalDuration,
      results,
      summary: {
        updated: results.filter(r => r.status === 'updated').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        failed: results.filter(r => r.status === 'failed').length,
      },
    });

  } catch (error: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error('[Daily Update] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        duration,
      },
      { status: 500 }
    );
  }
}

// ============================================
// Helper Functions
// ============================================

async function quickCheckNewPosts(manager: InstagramActorManager, since: string): Promise<any[]> {
  // Scrape only last 50 posts (very fast, < 30 seconds)
  const posts = await manager.scrapePosts(50);

  // Filter only posts newer than last sync
  const sinceDate = new Date(since);
  return posts.filter(post => new Date(post.posted_at) > sinceDate);
}

async function saveNewPosts(supabase: any, accountId: string, newPosts: any[]) {
  const postsToInsert = newPosts.map(post => ({
    account_id: accountId,
    shortcode: post.shortcode,
    post_id: post.post_id,
    post_url: post.post_url,
    type: post.type,
    caption: post.caption,
    hashtags: post.hashtags,
    mentions: post.mentions,
    media_urls: post.media_urls,
    thumbnail_url: post.thumbnail_url,
    video_duration: post.video_duration,
    likes_count: post.likes_count,
    comments_count: post.comments_count,
    views_count: post.views_count,
    posted_at: post.posted_at,
    location: post.location,
    is_sponsored: post.is_sponsored,
    scraped_at: new Date().toISOString(),
  }));

  // Upsert (insert or update if shortcode exists)
  const { error } = await supabase
    .from('instagram_posts')
    .upsert(postsToInsert, {
      onConflict: 'account_id,shortcode',
    });

  if (error) {
    console.error('[Daily Update] Error saving new posts:', error);
    throw new Error(`Failed to save new posts: ${error.message}`);
  }

  console.log(`[Daily Update] Saved ${newPosts.length} new posts`);
}

async function updatePersonaIncrementally(
  supabase: any,
  accountId: string,
  preprocessed: any
) {
  // Light update - only update preprocessing_data and scrape_stats
  // Don't rebuild the entire persona with Gemini (too expensive for daily)
  
  const { error } = await supabase
    .from('chatbot_persona')
    .update({
      preprocessing_data: preprocessed,
      instagram_last_synced: new Date().toISOString(),
      scrape_stats: {
        ...preprocessed.stats,
        lastUpdate: new Date().toISOString(),
        updateType: 'incremental',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);

  if (error) {
    console.error('[Daily Update] Error updating persona:', error);
    throw new Error(`Failed to update persona: ${error.message}`);
  }

  console.log('[Daily Update] Persona updated incrementally');
}
