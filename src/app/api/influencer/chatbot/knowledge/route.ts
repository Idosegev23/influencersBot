import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { ingestDocument } from '@/lib/rag/ingest';
import { normalizeKnowledgeUrl, readLink, indexKnowledgeEntry } from '@/lib/knowledge/link-ingest';

/** Mirrors the CHECK constraint on chatbot_knowledge_base.knowledge_type. */
const KNOWLEDGE_TYPES = new Set([
  'active_partnership', 'coupon', 'product', 'faq', 'brand_info', 'custom',
]);

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
    const { knowledge_type, title, content, keywords, priority, source_url, refresh_daily } = body;

    // ---------- LINK MODE ----------
    // The customer gives a url instead of typing content. We read the page now,
    // store what it says, and remember whether they told us it changes.
    if (source_url) {
      const url = normalizeKnowledgeUrl(String(source_url));
      if (!url) {
        return NextResponse.json({ error: 'That does not look like a web address' }, { status: 400 });
      }

      const read = await readLink(url);
      if (!read.ok) {
        // Nothing is stored on failure. A link that shows up in the dashboard
        // while contributing nothing to the assistant is worse than an error.
        return NextResponse.json({ error: read.error || 'Could not read that page' }, { status: 422 });
      }

      const { data: linkEntry, error: linkError } = await supabase
        .from('chatbot_knowledge_base')
        .insert({
          account_id: auth.accountId,
          // knowledge_type is CHECK-constrained to a fixed content classification
          // and 'link' is not one of them — where the text came from is recorded
          // by source_type/source_url instead, which is the right axis for it.
          knowledge_type: KNOWLEDGE_TYPES.has(knowledge_type) ? knowledge_type : 'custom',
          title: title?.trim() || read.title,
          content: read.content,
          keywords: keywords || [],
          priority: priority || 0,
          source_type: 'url',
          source_url: url,
          refresh_daily: refresh_daily === true,
          last_fetched_at: new Date().toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (linkError || !linkEntry) {
        console.error('Failed to create link entry:', linkError);
        return NextResponse.json({ error: 'Failed to save the link' }, { status: 500 });
      }

      const indexed = await indexKnowledgeEntry({
        accountId: auth.accountId,
        entryId: linkEntry.id,
        title: linkEntry.title,
        content: read.content,
        knowledgeType: linkEntry.knowledge_type,
        sourceUrl: url,
      });

      return NextResponse.json({ success: true, knowledge: linkEntry, indexed });
    }

    if (!knowledge_type || !title || !content) {
      return NextResponse.json(
        { error: 'knowledge_type, title, and content are required' },
        { status: 400 }
      );
    }

    // Say which value was wrong. Letting the database reject it produced a 500
    // reading "Failed to save", which tells the customer nothing actionable.
    if (!KNOWLEDGE_TYPES.has(knowledge_type)) {
      return NextResponse.json(
        { error: `Unknown content type "${knowledge_type}"` },
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
