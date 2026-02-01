import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/chatbot/persona
 * Fetch current chatbot persona
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;

    // Get persona
    const { data: persona, error: personaError } = await supabase
      .from('chatbot_persona')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (personaError && personaError.code !== 'PGRST116') {
      console.error('Failed to fetch persona:', personaError);
      return NextResponse.json({ error: 'Failed to fetch persona' }, { status: 500 });
    }

    // Return persona or null if not found
    return NextResponse.json({ persona: persona || null });
  } catch (error) {
    console.error('GET /api/influencer/chatbot/persona error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/influencer/chatbot/persona
 * Trigger manual sync from Instagram
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account with Instagram username
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (!account.instagram_username) {
      return NextResponse.json(
        { error: 'Instagram username not configured' },
        { status: 400 }
      );
    }

    // Sync Instagram and regenerate persona
    const persona = await syncInstagramAndRegeneratePersona(
      account.id,
      account.instagram_username
    );

    return NextResponse.json({ 
      success: true,
      persona,
      message: 'Persona synced successfully from Instagram',
    });
  } catch (error) {
    console.error('POST /api/influencer/chatbot/persona error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync persona';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * PATCH /api/influencer/chatbot/persona
 * Update persona directives manually
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;

    // Parse request body
    const body = await req.json();
    const { directives, tone, emoji_usage, greeting_message, custom_responses, bio, interests } = body;

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (directives !== undefined) updates.directives = directives;
    if (tone !== undefined) updates.tone = tone;
    if (emoji_usage !== undefined) updates.emoji_usage = emoji_usage;
    if (greeting_message !== undefined) updates.greeting_message = greeting_message;
    if (custom_responses !== undefined) updates.custom_responses = custom_responses;
    if (bio !== undefined) updates.bio = bio;
    if (interests !== undefined) updates.interests = interests;

    // Check if persona exists
    const { data: existingPersona } = await supabase
      .from('chatbot_persona')
      .select('id')
      .eq('account_id', accountId)
      .single();

    let persona;
    if (existingPersona) {
      // Update existing
      const { data, error: updateError } = await supabase
        .from('chatbot_persona')
        .update(updates)
        .eq('account_id', accountId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update persona:', updateError);
        return NextResponse.json({ error: 'Failed to update persona' }, { status: 500 });
      }
      persona = data;
    } else {
      // Create new
      const { data, error: insertError } = await supabase
        .from('chatbot_persona')
        .insert({
          account_id: accountId,
          name: auth.username || 'Influencer',
          ...updates,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create persona:', insertError);
        return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 });
      }
      persona = data;
    }

    return NextResponse.json({ 
      success: true,
      persona,
      message: 'Persona updated successfully',
    });
  } catch (error) {
    console.error('PATCH /api/influencer/chatbot/persona error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
