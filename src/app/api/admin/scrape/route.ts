import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getInfluencerByUsername } from '@/lib/supabase';
import { runBackgroundScrape } from '@/lib/background-scraper';
import { getProgress } from '@/lib/scraping-progress';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Increase timeout to 8 minutes (Vercel Pro max: 900s)
export const maxDuration = 480; // 8 minutes

/**
 * Admin scrape endpoint - returns immediately, runs in background
 * Returns 202 Accepted status with progress URL
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

    // Check if already scraping
    const existingProgress = await getProgress(username);
    if (existingProgress && existingProgress.status !== 'completed' && existingProgress.status !== 'failed') {
      return NextResponse.json({ 
        error: 'Scrape already in progress',
        progress: existingProgress
      }, { status: 409 });
    }

    console.log(`🚀 Starting background scrape for ${username}...`);

    // Start background scrape (don't await - fire and forget)
    runBackgroundScrape(username, false).catch(error => {
      console.error('Background scrape error:', error);
    });

    // Return immediately with 202 Accepted
    return NextResponse.json({
      message: 'Scrape started',
      username,
      status: 'processing',
      progressUrl: `/api/admin/scrape-progress/${username}`,
    }, { status: 202 });

  } catch (error) {
    console.error('Admin scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start scrape' },
      { status: 500 }
    );
  }
}
