import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getInfluencerByUsername } from '@/lib/supabase';
import { runBackgroundScrape } from '@/lib/background-scraper';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Increase timeout to 8 minutes (Vercel Pro max: 900s)
export const maxDuration = 480; // 8 minutes

/**
 * Admin scrape endpoint - ULTRA-FAST scraping with Gemini Flash
 * Optimized to complete in 30-90 seconds
 */
export async function POST(req: NextRequest) {
  try {
    const { username, adminPassword } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check admin authentication
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get('influencerbot_admin_session');
    const isAdminCookie = adminCookie?.value === 'authenticated';
    const isAdminPassword = adminPassword === ADMIN_PASSWORD;
    
    if (!isAdminCookie && !isAdminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify influencer exists
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    console.log(`🚀 Starting ULTRA-FAST scrape for ${username}...`);

    // Run synchronously (fire-and-forget doesn't work in Vercel!)
    const result = await runBackgroundScrape(username, false);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Return success with stats
    return NextResponse.json({
      message: 'Scrape completed',
      username,
      status: 'completed',
      stats: result.stats,
    }, { status: 200 });

  } catch (error) {
    console.error('Admin scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start scrape' },
      { status: 500 }
    );
  }
}
