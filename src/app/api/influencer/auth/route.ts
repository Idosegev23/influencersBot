import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getInfluencerBySubdomain, getInfluencerByUsername } from '@/lib/supabase';
import { verifyPassword } from '@/lib/utils';

const COOKIE_PREFIX = 'influencer_session_';

// Check if authenticated for a specific username
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ authenticated: false });
    }

    const cookieStore = await cookies();
    const session = cookieStore.get(`${COOKIE_PREFIX}${username}`);

    if (session?.value === 'authenticated') {
      const influencer = await getInfluencerByUsername(username);
      return NextResponse.json({
        authenticated: true,
        influencer: influencer
          ? {
              id: influencer.id,
              username: influencer.username,
              display_name: influencer.display_name,
              avatar_url: influencer.avatar_url,
            }
          : null,
      });
    }

    return NextResponse.json({ authenticated: false });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subdomain, username, password, action } = body;

    // Handle logout
    if (action === 'logout' && username) {
      const response = NextResponse.json({ success: true });
      response.cookies.set(`${COOKIE_PREFIX}${username}`, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
      });
      return response;
    }

    // Get identifier - support both subdomain and username
    const identifier = username || subdomain;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Missing credentials' },
        { status: 400 }
      );
    }

    // Try to find influencer by username first, then by subdomain
    let influencer = await getInfluencerByUsername(identifier);
    if (!influencer) {
      influencer = await getInfluencerBySubdomain(identifier);
    }

    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    // Get password hash from security_config or admin_password_hash column
    const passwordHash = influencer.admin_password_hash || influencer.security_config?.admin_password_hash;
    
    if (!passwordHash) {
      return NextResponse.json(
        { error: 'No password configured for this influencer' },
        { status: 401 }
      );
    }
    
    const isValid = await verifyPassword(password, passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      influencer: {
        id: influencer.id,
        username: influencer.username,
        display_name: influencer.display_name,
        avatar_url: influencer.avatar_url,
      },
    });

    response.cookies.set(`${COOKIE_PREFIX}${influencer.username}`, 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}


