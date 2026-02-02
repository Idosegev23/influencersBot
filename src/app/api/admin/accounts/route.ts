import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'influencerbot_admin_session';

// Check admin authentication
async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

/**
 * POST /api/admin/accounts
 * Create a new account (influencer or agent)
 */
export async function POST(request: Request) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { username, type = 'influencer' } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Create account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        type,
        config: {
          username,
          display_name: username,
          subdomain: username.toLowerCase().replace(/[^a-z0-9]/g, ''),
        },
        plan: 'free',
        status: 'pending', // Will be activated after setup
        timezone: 'Asia/Jerusalem',
        language: 'he',
        allowed_channels: {
          web: true,
          whatsapp: false,
        },
        features: {
          chatbot: true,
          analytics: true,
        },
      })
      .select()
      .single();

    if (accountError || !account) {
      console.error('Error creating account:', accountError);
      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accountId: account.id,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/accounts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
