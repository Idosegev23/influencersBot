import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

// Check admin authentication
async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('admin_authenticated');
  return authCookie?.value === 'true';
}

// CREATE content item
export async function POST(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { influencer_id, type, title, description, content, image_url, source_post_id } = body;

    if (!influencer_id || !type || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: influencer_id, type, title' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('content_items')
      .insert({
        influencer_id,
        type,
        title,
        description: description || null,
        content: content || {},
        image_url: image_url || null,
        source_post_id: source_post_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, content: data });
  } catch (error) {
    console.error('Error creating content:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create content' },
      { status: 500 }
    );
  }
}

// GET content items for an influencer
export async function GET(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const influencer_id = searchParams.get('influencer_id');

  if (!influencer_id) {
    return NextResponse.json({ error: 'influencer_id required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('influencer_id', influencer_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ content: data });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

// DELETE content item
export async function DELETE(req: NextRequest) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('content_items')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content:', error);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}

