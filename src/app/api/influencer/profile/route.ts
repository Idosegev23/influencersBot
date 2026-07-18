import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { sanitizeInfluencerForClient } from '@/lib/influencer/sanitize';

/**
 * GET /api/influencer/profile?username=...
 *
 * The browser's only route to account data. Client components used to call
 * getInfluencerByUsername() directly, which reached Postgres with the public
 * anon key and handed the caller accounts.* — password hash and all. This runs
 * server-side with the service role and returns a sanitized projection.
 *
 * Unauthenticated on purpose: the public chat page renders for anonymous
 * visitors. sanitizeInfluencerForClient is therefore the only thing standing
 * between accounts.* and the open internet — keep it that way.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);

    if (!influencer) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const safe = sanitizeInfluencerForClient(influencer as any)!;

    // `account` mirrors what chatbot-settings and the instagram page already read.
    return NextResponse.json({
      account: {
        id: safe.id,
        username: safe.username,
        displayName: safe.display_name,
        type: safe.type,
        status: safe.is_active ? 'active' : 'inactive',
      },
      influencer: safe,
    });
  } catch (error) {
    console.error('[Profile] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
