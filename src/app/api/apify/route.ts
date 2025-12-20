import { NextRequest, NextResponse } from 'next/server';
import { scrapeInstagramProfile, parseInstagramUrl } from '@/lib/apify';

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

    // Scrape profile with default settings
    const result = await scrapeInstagramProfile(parsed.username, { posts_limit: 50 });

    return NextResponse.json({
      success: true,
      profile: result.profile,
      posts: result.posts,
    });
  } catch (error) {
    console.error('Apify API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scrape profile' },
      { status: 500 }
    );
  }
}


