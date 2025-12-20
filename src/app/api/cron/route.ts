import { NextRequest, NextResponse } from 'next/server';
import { getAllInfluencers, updateInfluencer, upsertPosts } from '@/lib/supabase';
import { scrapeInstagramProfile } from '@/lib/apify';
import { analyzeAllPosts, extractDataFromPost } from '@/lib/openai';
import type { ApifyPostData, Post } from '@/types';

// Vercel Cron - runs daily at 3 AM
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// Verify cron secret
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  // Verify request is from Vercel Cron
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting daily sync...');

    // Get all active influencers
    const influencers = await getAllInfluencers();
    const activeInfluencers = influencers.filter((i) => i.is_active);

    console.log(`Found ${activeInfluencers.length} active influencers`);

    const results = [];

    for (const influencer of activeInfluencers) {
      try {
        console.log(`Syncing ${influencer.username}...`);

        // Fetch latest posts using influencer's scrape settings
        const { profile, posts } = await scrapeInstagramProfile(
          influencer.username,
          influencer.scrape_settings || { posts_limit: 20 }
        );

        // Analyze new posts
        const postAnalysis = await analyzeAllPosts(posts);

        // Convert to database format
        const dbPosts: Omit<Post, 'id' | 'created_at'>[] = posts.map((post) => {
          const extracted = postAnalysis.get(post.shortCode);
          return {
            influencer_id: influencer.id,
            shortcode: post.shortCode,
            type: post.type.toLowerCase() as 'image' | 'video' | 'reel' | 'carousel',
            caption: post.caption || '',
            image_url: post.displayUrl,
            video_url: post.videoUrl || null,
            likes_count: post.likesCount,
            comments_count: post.commentsCount,
            posted_at: post.timestamp,
            extracted_data: extracted || null,
            is_analyzed: !!extracted,
          };
        });

        // Upsert posts (will update existing or insert new)
        await upsertPosts(dbPosts);

        // Update last synced timestamp
        await updateInfluencer(influencer.id, {
          last_synced_at: new Date().toISOString(),
          followers_count: profile.followersCount,
        });

        results.push({
          influencer: influencer.username,
          status: 'success',
          postsProcessed: posts.length,
        });

        console.log(`Synced ${influencer.username}: ${posts.length} posts`);

        // Small delay between influencers to avoid rate limits
        await new Promise((r) => setTimeout(r, 2000));
      } catch (error) {
        console.error(`Failed to sync ${influencer.username}:`, error);
        results.push({
          influencer: influencer.username,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log('Daily sync completed');

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}

// Manual trigger endpoint (for testing)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subdomain } = await req.json();

    if (!subdomain) {
      return NextResponse.json(
        { error: 'Subdomain required' },
        { status: 400 }
      );
    }

    // Find influencer
    const influencers = await getAllInfluencers();
    const influencer = influencers.find((i) => i.subdomain === subdomain);

    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    // Fetch and sync using influencer's scrape settings
    const { profile, posts } = await scrapeInstagramProfile(
      influencer.username,
      influencer.scrape_settings || { posts_limit: 30 }
    );
    const postAnalysis = await analyzeAllPosts(posts);

    const dbPosts: Omit<Post, 'id' | 'created_at'>[] = posts.map((post) => {
      const extracted = postAnalysis.get(post.shortCode);
      return {
        influencer_id: influencer.id,
        shortcode: post.shortCode,
        type: post.type.toLowerCase() as 'image' | 'video' | 'reel' | 'carousel',
        caption: post.caption || '',
        image_url: post.displayUrl,
        video_url: post.videoUrl || null,
        likes_count: post.likesCount,
        comments_count: post.commentsCount,
        posted_at: post.timestamp,
        extracted_data: extracted || null,
        is_analyzed: !!extracted,
      };
    });

    await upsertPosts(dbPosts);
    await updateInfluencer(influencer.id, {
      last_synced_at: new Date().toISOString(),
      followers_count: profile.followersCount,
    });

    return NextResponse.json({
      success: true,
      postsProcessed: posts.length,
    });
  } catch (error) {
    console.error('Manual sync failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}


