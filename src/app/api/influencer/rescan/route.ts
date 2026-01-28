import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getInfluencerByUsername } from '@/lib/supabase';
import { runBackgroundScrape } from '@/lib/background-scraper';

const COOKIE_PREFIX = 'influencer_session_';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Increase timeout to 8 minutes (Vercel Pro max: 900s)
export const maxDuration = 480; // 8 minutes

/**
 * Check influencer authentication
 */
async function checkAuth(username: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(`${COOKIE_PREFIX}${username}`);
    return authCookie?.value === 'authenticated';
  } catch (error) {
    console.error('Error checking auth:', error);
    return false;
  }
}

/**
 * Influencer rescan endpoint - ULTRA-FAST rescanning with Gemini Flash
 * Optimized to complete in 30-90 seconds
 */
export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check authentication (influencer or admin)
    const cookieStore = await cookies();
    const adminCookie = cookieStore.get('influencerbot_admin_session');
    const isAdmin = adminCookie?.value === 'authenticated';
    const isAuth = await checkAuth(username);
    
    if (!isAuth && !isAdmin) {
      console.log(`Auth failed for ${username}. isAuth=${isAuth}, isAdmin=${isAdmin}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify influencer exists
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    console.log(`🔄 Starting ULTRA-FAST rescan for ${username}...`);

    // Run synchronously (fire-and-forget doesn't work in Vercel!)
    const result = await runBackgroundScrape(username, true);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Return success with stats
    return NextResponse.json({
      message: 'Rescan completed',
      username,
      status: 'completed',
      stats: result.stats,
    }, { status: 200 });

  } catch (error) {
    console.error('Rescan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start rescan' },
      { status: 500 }
    );
  }
}
