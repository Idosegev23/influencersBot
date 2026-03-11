import { NextRequest, NextResponse } from 'next/server';
import { getScrapeCreatorsClient } from '@/lib/scraping/scrapeCreatorsClient';
import { parseInstagramUrl } from '@/lib/apify';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Parse username from URL
    const parsed = parseInstagramUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid Instagram URL' },
        { status: 400 }
      );
    }

    // Scrape profile + posts via ScrapeCreators
    const client = getScrapeCreatorsClient();
    const [scProfile, scPosts] = await Promise.all([
      client.getProfile(parsed.username),
      client.getPosts(parsed.username, 50),
    ]);

    // Map to legacy ApifyProfileData format for backward compatibility
    const profile = {
      username: scProfile.username,
      fullName: scProfile.full_name || '',
      biography: scProfile.bio || '',
      profilePicUrl: scProfile.profile_pic_url || '',
      followersCount: scProfile.followers_count || 0,
      followingCount: scProfile.following_count || 0,
      postsCount: scProfile.posts_count || 0,
      isVerified: scProfile.is_verified || false,
    };

    // Map to legacy ApifyPostData format for backward compatibility
    const posts = scPosts.map((p) => ({
      shortCode: p.shortcode,
      type: p.media_type === 'video' ? 'Video' : p.media_type === 'carousel' ? 'Sidecar' : 'Image',
      caption: p.caption || '',
      displayUrl: p.thumbnail_url || p.media_urls[0] || '',
      videoUrl: p.media_type === 'video' ? p.media_urls[0] : undefined,
      likesCount: p.likes_count || 0,
      commentsCount: p.comments_count || 0,
      timestamp: p.posted_at || new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      profile,
      posts,
    });
  } catch (error) {
    console.error('Scrape API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scrape profile' },
      { status: 500 }
    );
  }
}
