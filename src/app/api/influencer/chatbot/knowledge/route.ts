import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/influencer/chatbot/knowledge
 * List knowledge base entries
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get('type'); // Filter by knowledge_type
    const activeOnly = searchParams.get('active') === 'true';

    // Build query
    let query = supabase
      .from('chatbot_knowledge_base')
      .select('*')
      .eq('account_id', account.id);

    if (type) {
      query = query.eq('knowledge_type', type);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });

    const { data: knowledge, error: knowledgeError } = await query;

    if (knowledgeError) {
      console.error('Failed to fetch knowledge base:', knowledgeError);
      return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 });
    }

    return NextResponse.json({ knowledge });
  } catch (error) {
    console.error('GET /api/influencer/chatbot/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/influencer/chatbot/knowledge
 * Add manual knowledge entry
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Parse request body
    const body = await req.json();
    const { knowledge_type, title, content, keywords, priority } = body;

    // Validate required fields
    if (!knowledge_type || !title || !content) {
      return NextResponse.json(
        { error: 'knowledge_type, title, and content are required' },
        { status: 400 }
      );
    }

    // Create knowledge entry
    const { data: knowledgeEntry, error: createError } = await supabase
      .from('chatbot_knowledge_base')
      .insert({
        account_id: account.id,
        knowledge_type,
        title,
        content,
        keywords: keywords || [],
        priority: priority || 0,
        source_type: 'manual',
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      console.error('Failed to create knowledge entry:', createError);
      return NextResponse.json({ error: 'Failed to create knowledge entry' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      knowledge: knowledgeEntry,
      message: 'Knowledge entry created successfully',
    });
  } catch (error) {
    console.error('POST /api/influencer/chatbot/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/influencer/chatbot/knowledge?id=xxx
 * Remove knowledge entry
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Get entry ID from query params
    const searchParams = req.nextUrl.searchParams;
    const entryId = searchParams.get('id');

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    // Delete entry (with account check for security)
    const { error: deleteError } = await supabase
      .from('chatbot_knowledge_base')
      .delete()
      .eq('id', entryId)
      .eq('account_id', account.id);

    if (deleteError) {
      console.error('Failed to delete knowledge entry:', deleteError);
      return NextResponse.json({ error: 'Failed to delete knowledge entry' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Knowledge entry deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /api/influencer/chatbot/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
