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

    // First, check if account with this username already exists
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('config->>username', username)
      .maybeSingle();

    if (existingAccount) {
      console.log(`[Accounts] Account with username @${username} already exists, returning existing ID`);
      return NextResponse.json({
        success: true,
        accountId: existingAccount.id,
        existed: true,
      });
    }

    // Create account only if it doesn't exist
    // Note: type must be 'creator' or 'brand' per DB constraint
    const accountType = type === 'influencer' ? 'creator' : type;
    
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        type: accountType,
        config: {
          username,
          display_name: username,
          subdomain: username.toLowerCase().replace(/[^a-z0-9]/g, ''),
        },
        plan: 'free',
        status: 'active',
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
        { error: 'Failed to create account', details: accountError?.message },
        { status: 500 }
      );
    }

    console.log(`[Accounts] Created new account for @${username}, ID: ${account.id}`);

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
