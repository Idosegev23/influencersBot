import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { ingestDocument } from '@/lib/rag/ingest';

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

    // Index it NOW, not on the next scan.
    //
    // This used to be a bare insert. `rag-ingest` does know how to embed
    // knowledge_base rows, but only a full pipeline run triggers it — and demo
    // accounts have scans switched off entirely, so content a customer added
    // could sit unindexed forever. Meanwhile the chat's direct read takes only
    // the top 20 by priority, so the 21st entry reached the assistant through
    // nothing at all.
    //
    // Indexing failure must not lose the customer's writing: the row is already
    // saved, so report it as saved-but-not-yet-searchable and let the next scan
    // pick it up.
    let indexed = false;
    try {
      await ingestDocument({
        accountId: auth.accountId,
        entityType: 'knowledge_base',
        sourceId: entry.id,
        title,
        text: content,
        metadata: { knowledgeType: knowledge_type, keywords: keywords || [] },
      });
      indexed = true;
    } catch (err) {
      console.error('[knowledge] saved but not indexed:', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ success: true, knowledge: entry, indexed });
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

    // Remove its embeddings too. Without this the entry vanishes from the
    // dashboard while the assistant keeps answering from it — the customer
    // deletes something and the bot goes on saying it.
    try {
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('account_id', auth.accountId)
        .eq('entity_type', 'knowledge_base')
        .eq('source_id', entryId)
        .maybeSingle();
      if (doc) {
        await supabase.from('document_chunks').delete().eq('document_id', doc.id);
        await supabase.from('documents').delete().eq('id', doc.id);
      }
    } catch (err) {
      console.error('[knowledge] deleted row but failed to unindex:', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/influencer/chatbot/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
