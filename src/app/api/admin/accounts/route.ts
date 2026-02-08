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
 * GET /api/admin/accounts
 * Get all accounts (replaces old /api/admin/influencers)
 */
export async function GET() {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // Get all accounts with their related data (including profile info)
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select(`
        id,
        type,
        config,
        plan,
        status,
        created_at,
        updated_at,
        chatbot_persona(
          id,
          name,
          instagram_username,
          instagram_followers,
          instagram_posts_count
        ),
        instagram_profile_history(
          username,
          full_name,
          bio,
          followers_count,
          following_count,
          posts_count,
          profile_pic_url,
          is_verified,
          category,
          snapshot_date
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching accounts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch accounts', details: error.message },
        { status: 500 }
      );
    }

    // Transform to match old influencer format for backward compatibility
    const transformed = (accounts || []).map((account: any) => {
      const config = account.config || {};
      const persona = account.chatbot_persona?.[0];
      
      // Get latest profile data (sorted by snapshot_date DESC in query)
      const profileHistory = account.instagram_profile_history || [];
      const latestProfile = profileHistory.length > 0 
        ? profileHistory.sort((a: any, b: any) => 
            new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
          )[0]
        : null;
      
      return {
        id: account.id,
        username: config.username || latestProfile?.username || persona?.instagram_username || 'unknown',
        display_name: config.display_name || latestProfile?.full_name || persona?.name || config.username || 'Unknown',
        subdomain: config.subdomain || config.username || account.id,
        
        // Instagram profile data (from latest snapshot)
        instagram_username: latestProfile?.username || persona?.instagram_username || config.username,
        followers_count: latestProfile?.followers_count || persona?.instagram_followers || 0,
        following_count: latestProfile?.following_count || 0,
        posts_count: latestProfile?.posts_count || persona?.instagram_posts_count || 0,
        profile_pic_url: latestProfile?.profile_pic_url || null,
        bio: latestProfile?.bio || null,
        is_verified: latestProfile?.is_verified || false,
        category: latestProfile?.category || null,
        
        // Account info
        is_active: account.status === 'active',
        plan: account.plan || 'free',
        type: account.type,
        created_at: account.created_at,
        updated_at: account.updated_at,
        
        // Include persona if exists
        persona_name: persona?.name,
        has_persona: !!persona,
        has_profile_data: !!latestProfile,
      };
    });

    return NextResponse.json({
      success: true,
      influencers: transformed, // ⚡ Wrap in object for dashboard compatibility
      accounts: transformed,    // ⚡ Also provide as 'accounts' for new code
    });
  } catch (error) {
    console.error('Error in GET /api/admin/accounts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
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

    // ⚡ STEP 1: Check if account with this username already exists
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

    // ⚡ STEP 2: Prepare account data
    const displayName = username;
    const subdomain = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    console.log(`[Accounts] Creating new account for @${username}`);

    // ⚡ STEP 3: Create account
    const accountType = type === 'influencer' ? 'creator' : type;
    
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        type: accountType,
        config: {
          username,
          display_name: displayName,
          subdomain: subdomain,
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
