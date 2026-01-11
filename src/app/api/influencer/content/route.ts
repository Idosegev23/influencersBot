import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

// Check influencer authentication
async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_auth_${username}`);
  return authCookie?.value === 'authenticated';
}

// GET content items
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  const isAuth = await checkAuth(username);
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    const { data: content, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('influencer_id', influencer.id)
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

    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
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

  const isAuth = await checkAuth(username);
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
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








