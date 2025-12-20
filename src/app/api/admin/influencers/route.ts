import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { 
  getAllInfluencers, 
  createInfluencer, 
  updateInfluencer,
  getInfluencerById,
} from '@/lib/supabase';
import { hashPassword } from '@/lib/utils';
import { generateGreetingAndQuestions } from '@/lib/openai';
// Note: We use Responses API now - no need to create assistants beforehand

const COOKIE_NAME = 'influencerbot_admin_session';

// Check admin authentication
async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

// GET all influencers
export async function GET() {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const influencers = await getAllInfluencers();
    return NextResponse.json({ influencers });
  } catch (error) {
    console.error('Error fetching influencers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch influencers' },
      { status: 500 }
    );
  }
}

// CREATE new influencer
export async function POST(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      username,
      subdomain,
      display_name,
      bio,
      avatar_url,
      followers_count,
      following_count,
      influencer_type,
      persona,
      theme,
      admin_password,
      context,
    } = body;

    // Validate required fields
    if (!username || !subdomain || !display_name || !admin_password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Hash password
    const admin_password_hash = await hashPassword(admin_password);

    // Note: We use Responses API now - no need to create assistants beforehand
    // The chat API uses the persona directly to build instructions

    // Generate personalized greeting and suggested questions using AI
    let greeting_message: string | undefined;
    let suggested_questions: string[] | undefined;
    
    if (persona && influencer_type) {
      try {
        const personalization = await generateGreetingAndQuestions(
          display_name,
          influencer_type,
          persona,
          [] // Products will be added later
        );
        greeting_message = personalization.greeting;
        suggested_questions = personalization.questions;
      } catch (error) {
        console.error('Error generating personalization:', error);
        // Continue without personalization - defaults will be used in chat UI
      }
    }

    // Create influencer
    const influencer = await createInfluencer({
      username,
      subdomain,
      display_name,
      bio: bio || '',
      avatar_url: avatar_url || '',
      followers_count: followers_count || 0,
      following_count: following_count || 0,
      influencer_type: influencer_type || 'other',
      assistant_id: null, // Not needed with Responses API
      persona: persona || null,
      theme: theme || {
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
      admin_password_hash,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      greeting_message,
      suggested_questions,
    });

    if (!influencer) {
      return NextResponse.json(
        { error: 'Failed to create influencer' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      influencer,
    });
  } catch (error) {
    console.error('Error creating influencer:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create influencer' },
      { status: 500 }
    );
  }
}

// UPDATE influencer
export async function PUT(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Influencer ID required' },
        { status: 400 }
      );
    }

    // If password is being updated, hash it
    if (updates.admin_password) {
      updates.admin_password_hash = await hashPassword(updates.admin_password);
      delete updates.admin_password;
    }

    const success = await updateInfluencer(id, updates);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update influencer' },
        { status: 500 }
      );
    }

    const updated = await getInfluencerById(id);

    return NextResponse.json({
      success: true,
      influencer: updated,
    });
  } catch (error) {
    console.error('Error updating influencer:', error);
    return NextResponse.json(
      { error: 'Failed to update influencer' },
      { status: 500 }
    );
  }
}

// DELETE influencer
export async function DELETE(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Influencer ID required' },
        { status: 400 }
      );
    }

    // Import supabase client directly for delete
    const { supabase } = await import('@/lib/supabase');

    // Delete related data first (products, sessions, etc.)
    await supabase.from('products').delete().eq('influencer_id', id);
    await supabase.from('content_items').delete().eq('influencer_id', id);
    await supabase.from('posts').delete().eq('influencer_id', id);
    await supabase.from('analytics_events').delete().eq('influencer_id', id);
    await supabase.from('support_requests').delete().eq('influencer_id', id);
    
    // Delete chat messages via sessions
    const { data: sessions } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('influencer_id', id);
    
    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      await supabase.from('chat_messages').delete().in('session_id', sessionIds);
    }
    await supabase.from('chat_sessions').delete().eq('influencer_id', id);

    // Finally delete the influencer
    const { error } = await supabase.from('influencers').delete().eq('id', id);

    if (error) {
      console.error('Error deleting influencer:', error);
      return NextResponse.json(
        { error: 'Failed to delete influencer' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting influencer:', error);
    return NextResponse.json(
      { error: 'Failed to delete influencer' },
      { status: 500 }
    );
  }
}

