/**
 * CRUD /api/manage/knowledge
 * Knowledge base management for website owners
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateManageSession } from '@/lib/manage/auth';
import { ingestDocument } from '@/lib/rag/ingest';

/**
 * GET — list knowledge entries for the account
 * Query params: ?type=custom&active_only=true
 */
export async function GET(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const activeOnly = searchParams.get('active_only') !== 'false';

    const supabase = await createClient();
    let query = supabase
      .from('chatbot_knowledge_base')
      .select('id, knowledge_type, title, content, keywords, source_type, is_active, priority, times_used, created_at, updated_at')
      .eq('account_id', session.accountId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('knowledge_type', type);
    }
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ManageKnowledge] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch knowledge' }, { status: 500 });
    }

    return NextResponse.json({ success: true, entries: data || [] });
  } catch (error: any) {
    console.error('[ManageKnowledge] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST — add a new knowledge entry
 * Body: { knowledge_type, title, content, keywords?, priority? }
 */
export async function POST(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { knowledge_type = 'custom', title, content, keywords = [], priority = 0 } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }

    const validTypes = ['custom', 'faq', 'product', 'brand_info'];
    if (!validTypes.includes(knowledge_type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('chatbot_knowledge_base')
      .insert({
        account_id: session.accountId,
        knowledge_type,
        title,
        content,
        keywords: Array.isArray(keywords) ? keywords : [],
        source_type: 'manual',
        is_active: true,
        priority,
      })
      .select()
      .single();

    if (error) {
      console.error('[ManageKnowledge] POST error:', error);
      return NextResponse.json({ error: 'Failed to add knowledge', details: error.message }, { status: 500 });
    }

    // RAG ingestion — embed the knowledge for vector search (fire-and-forget)
    if (data?.id && content) {
      ingestDocument({
        accountId: session.accountId,
        entityType: 'knowledge_base',
        sourceId: data.id,
        title,
        text: content,
        metadata: {
          knowledgeType: knowledge_type,
          keywords: Array.isArray(keywords) ? keywords : [],
        },
      }).catch(err => console.error('[ManageKnowledge] RAG ingest failed:', err));
    }

    return NextResponse.json({ success: true, entry: data });
  } catch (error: any) {
    console.error('[ManageKnowledge] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH — edit existing entry
 * Body: { id, title?, content?, keywords?, priority?, is_active? }
 */
export async function PATCH(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Only allow safe fields to be updated
    const allowedFields = ['title', 'content', 'keywords', 'priority', 'is_active', 'knowledge_type'];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('chatbot_knowledge_base')
      .update(safeUpdates)
      .eq('id', id)
      .eq('account_id', session.accountId)
      .select()
      .single();

    if (error) {
      console.error('[ManageKnowledge] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update', details: error.message }, { status: 500 });
    }

    // Re-ingest into RAG if content or title changed (fire-and-forget)
    if (data && (safeUpdates.content || safeUpdates.title)) {
      ingestDocument({
        accountId: session.accountId,
        entityType: 'knowledge_base',
        sourceId: data.id,
        title: data.title,
        text: data.content,
        metadata: {
          knowledgeType: data.knowledge_type,
          keywords: data.keywords || [],
        },
      }).catch(err => console.error('[ManageKnowledge] RAG re-ingest failed:', err));
    }

    return NextResponse.json({ success: true, entry: data });
  } catch (error: any) {
    console.error('[ManageKnowledge] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE — remove knowledge entry
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Delete RAG document + chunks for this knowledge entry
    const { data: ragDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('account_id', session.accountId)
      .eq('entity_type', 'knowledge_base')
      .eq('source_id', id)
      .maybeSingle();

    if (ragDoc) {
      await supabase.from('document_chunks').delete().eq('document_id', ragDoc.id);
      await supabase.from('documents').delete().eq('id', ragDoc.id);
    }

    // Delete the knowledge entry itself
    const { error } = await supabase
      .from('chatbot_knowledge_base')
      .delete()
      .eq('id', id)
      .eq('account_id', session.accountId);

    if (error) {
      console.error('[ManageKnowledge] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ManageKnowledge] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
