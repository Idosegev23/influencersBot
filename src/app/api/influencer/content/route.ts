import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET content items
export async function GET(req: NextRequest) {
  try {
    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { data: content, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('influencer_id', auth.influencer.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

// UPDATE content item
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, id, title, description, content } = body;

    if (!username || !id) {
      return NextResponse.json({ error: 'Username and ID required' }, { status: 400 });
    }

    // Auth check
    const authCheck = await requireInfluencerAuth(req);
    if (!authCheck.authorized) {
      return authCheck.response!;
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }
    
    // Verify access to this influencer
    if (authCheck.accountId !== influencer.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('content_items')
      .update({
        title,
        description,
        content,
      })
      .eq('id', id)
      .eq('influencer_id', influencer.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

// DELETE content item
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const id = searchParams.get('id');

  if (!username || !id) {
    return NextResponse.json({ error: 'Username and ID required' }, { status: 400 });
  }

  // Auth check
  const authCheck = await requireInfluencerAuth(req);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  try {
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }
    
    // Verify access
    if (authCheck.accountId !== influencer.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('content_items')
      .delete()
      .eq('id', id)
      .eq('influencer_id', influencer.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content:', error);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}








