import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/chatbot/knowledge
 * List knowledge base entries
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get('type');
    const activeOnly = searchParams.get('active') === 'true';

    let query = supabase
      .from('chatbot_knowledge_base')
      .select('*')
      .eq('account_id', auth.accountId);

    if (type) {
      query = query.eq('knowledge_type', type);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });

    const { data: knowledge, error } = await query;

    if (error) {
      console.error('Failed to fetch knowledge base:', error);
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
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const body = await req.json();
    const { knowledge_type, title, content, keywords, priority } = body;

    if (!knowledge_type || !title || !content) {
      return NextResponse.json(
        { error: 'knowledge_type, title, and content are required' },
        { status: 400 }
      );
    }

    const { data: entry, error } = await supabase
      .from('chatbot_knowledge_base')
      .insert({
        account_id: auth.accountId,
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

    if (error) {
      console.error('Failed to create knowledge entry:', error);
      return NextResponse.json({ error: 'Failed to create knowledge entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, knowledge: entry });
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
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const entryId = req.nextUrl.searchParams.get('id');
    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('chatbot_knowledge_base')
      .delete()
      .eq('id', entryId)
      .eq('account_id', auth.accountId);

    if (error) {
      console.error('Failed to delete knowledge entry:', error);
      return NextResponse.json({ error: 'Failed to delete knowledge entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/influencer/chatbot/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
