import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get content items
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      );
    }

    // Get account by username
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get content items
    const { data: content, error: contentError } = await supabase
      .from('content_items')
      .select('*')
      .eq('influencer_id', account.id)
      .order('created_at', { ascending: false });

    if (contentError) {
      return NextResponse.json(
        { error: 'Failed to fetch content' },
        { status: 500 }
      );
    }

    return NextResponse.json({ content: content || [] });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Update content item
export async function PUT(req: NextRequest) {
  try {
    const { username, id, title, description, content } = await req.json();

    if (!username || !id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get account by username
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Update content item
    const { error: updateError } = await supabase
      .from('content_items')
      .update({
        title,
        description,
        content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('influencer_id', account.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update content' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete content item
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const id = searchParams.get('id');

    if (!username || !id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get account by username
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Delete content item
    const { error: deleteError } = await supabase
      .from('content_items')
      .delete()
      .eq('id', id)
      .eq('influencer_id', account.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete content' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
