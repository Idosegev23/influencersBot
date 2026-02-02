import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/utils';
import { createInfluencer } from '@/lib/supabase';

const COOKIE_NAME = 'influencerbot_admin_session';

// Check admin authentication
async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

/**
 * POST /api/admin/influencers/finalize
 * Finalize influencer setup after scraping is complete
 */
export async function POST(request: Request) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      accountId,
      username,
      subdomain,
      password,
      phoneNumber,
      whatsappEnabled,
    } = body;

    if (!accountId || !username || !subdomain || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the persona data from the account
    const { data: persona } = await supabase
      .from('chatbot_persona')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (!persona) {
      return NextResponse.json(
        { error: 'Persona not found - scraping may not be complete' },
        { status: 404 }
      );
    }

    // Hash the admin password
    const adminPasswordHash = await hashPassword(password);

    // Create the legacy influencer record
    const influencer = await createInfluencer({
      username,
      subdomain,
      display_name: persona.name || username,
      bio: persona.bio || '',
      avatar_url: '', // Will be updated from Instagram data
      followers_count: persona.instagram_followers || 0,
      following_count: persona.instagram_following || 0,
      influencer_type: 'other',
      assistant_id: null,
      persona: {
        description: persona.description || '',
        tone: persona.tone || 'ידידותי',
        topics: persona.topics || [],
        interests: persona.interests || [],
        response_style: persona.response_style || 'מפורט',
        emoji_usage: persona.emoji_usage || 'moderate',
      },
      theme: {
        colors: {
          primary: '#6366f1',
          accent: '#818cf8',
          background: '#ffffff',
          text: '#111827',
          surface: '#f9fafb',
          border: '#e5e7eb',
        },
        fonts: {
          heading: 'Heebo',
          body: 'Heebo',
        },
        style: 'minimal',
        darkMode: false,
      },
      admin_password_hash: adminPasswordHash,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      greeting_message: persona.greeting_message || 'שלום! איך אפשר לעזור?',
      suggested_questions: [],
      phone_number: phoneNumber || null,
      whatsapp_enabled: whatsappEnabled || false,
    });

    if (!influencer) {
      return NextResponse.json(
        { error: 'Failed to create influencer' },
        { status: 500 }
      );
    }

    // Update account with final settings
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        legacy_influencer_id: influencer.id,
        status: 'active',
        config: {
          username,
          display_name: persona.name || username,
          subdomain,
        },
        allowed_channels: {
          web: true,
          whatsapp: whatsappEnabled || false,
        },
      })
      .eq('id', accountId);

    if (updateError) {
      console.error('Error updating account:', updateError);
      // Don't fail - the influencer was created
    }

    return NextResponse.json({
      success: true,
      influencer,
      subdomain,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/influencers/finalize:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
