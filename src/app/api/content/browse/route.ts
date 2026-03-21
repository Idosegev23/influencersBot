import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/content/browse?username=X&topics=food,beauty&entityTypes=transcription,post&page=1&limit=20
 *
 * Returns content cards for the ContentBrowseTab.
 * Each card has: id, title, excerpt, thumbnail_url, topic, entity_type, created_at
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const topicsParam = searchParams.get('topics');
  const entityTypesParam = searchParams.get('entityTypes');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const supabase = createClient();

  // Get account ID
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('config->>username', username)
    .eq('status', 'active')
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const topics = topicsParam ? topicsParam.split(',').filter(Boolean) : null;
  const entityTypes = entityTypesParam ? entityTypesParam.split(',').filter(Boolean) : null;

  // Build the query — get unique documents (first chunk per document) with thumbnails
  // We use a raw SQL query for the complex join chain
  const { data, error } = await supabase.rpc('browse_content', {
    p_account_id: account.id,
    p_topics: topics,
    p_entity_types: entityTypes,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    // Fallback: simpler query without RPC (in case RPC doesn't exist yet)
    console.error('[content/browse] RPC error, using fallback:', error.message);
    return await fallbackQuery(supabase, account.id, topics, entityTypes, limit, offset);
  }

  return NextResponse.json({ items: data || [], page, limit });
}

async function fallbackQuery(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  topics: string[] | null,
  entityTypes: string[] | null,
  limit: number,
  offset: number,
) {
  // Get first chunk per document, grouped by document
  let query = supabase
    .from('document_chunks')
    .select(`
      id,
      document_id,
      entity_type,
      topic,
      chunk_text,
      chunk_index,
      metadata,
      updated_at
    `)
    .eq('account_id', accountId)
    .eq('chunk_index', 0) // Only first chunk per document
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (topics && topics.length > 0) {
    query = query.in('topic', topics);
  }
  if (entityTypes && entityTypes.length > 0) {
    query = query.in('entity_type', entityTypes);
  }

  const { data: chunks, error } = await query;

  if (error) {
    console.error('[content/browse] Fallback query error:', error.message);
    return NextResponse.json({ items: [], page: 1, limit });
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ items: [], page: 1, limit });
  }

  // Get document titles
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, source_id, entity_type')
    .in('id', docIds);

  const docMap = new Map((docs || []).map(d => [d.id, d]));

  // Get thumbnails from posts and highlight items
  const sourceIds = (docs || []).map(d => d.source_id).filter(Boolean);

  // Try posts first
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('id, thumbnail_url, shortcode')
    .in('id', sourceIds);
  const postMap = new Map((posts || []).map(p => [p.id, p]));

  // For transcriptions, we need to go through instagram_transcriptions → source
  const transcriptionSourceIds = (docs || [])
    .filter(d => d.entity_type === 'transcription')
    .map(d => d.source_id)
    .filter(Boolean);

  let thumbMap = new Map<string, string>();

  if (transcriptionSourceIds.length > 0) {
    const { data: transcriptions } = await supabase
      .from('instagram_transcriptions')
      .select('id, source_type, source_id')
      .in('id', transcriptionSourceIds);

    if (transcriptions) {
      const postSourceIds = transcriptions.filter(t => t.source_type === 'post').map(t => t.source_id);
      const highlightSourceIds = transcriptions.filter(t => t.source_type === 'highlight_item').map(t => t.source_id);

      if (postSourceIds.length > 0) {
        const { data: tPosts } = await supabase
          .from('instagram_posts')
          .select('id, thumbnail_url')
          .in('id', postSourceIds);
        (tPosts || []).forEach(p => { if (p.thumbnail_url) thumbMap.set(p.id, p.thumbnail_url); });
      }

      if (highlightSourceIds.length > 0) {
        const { data: highlights } = await supabase
          .from('instagram_highlight_items')
          .select('id, thumbnail_url')
          .in('id', highlightSourceIds);
        (highlights || []).forEach(h => { if (h.thumbnail_url) thumbMap.set(h.id, h.thumbnail_url); });
      }

      // Map transcription_id → thumbnail
      for (const t of transcriptions) {
        const thumb = thumbMap.get(t.source_id);
        if (thumb) thumbMap.set(t.id, thumb);
      }
    }
  }

  // Build response items
  const items = chunks.map(chunk => {
    const doc = docMap.get(chunk.document_id);
    const title = doc?.title || chunk.chunk_text.substring(0, 50).replace(/\n/g, ' ');

    // Get thumbnail
    let thumbnail_url: string | null = null;
    if (doc) {
      // Direct post
      const post = postMap.get(doc.source_id);
      if (post?.thumbnail_url) {
        thumbnail_url = post.thumbnail_url;
      }
      // Transcription → post/highlight
      if (!thumbnail_url && thumbMap.has(doc.source_id)) {
        thumbnail_url = thumbMap.get(doc.source_id) || null;
      }
    }

    const excerpt = chunk.chunk_text
      .replace(/\[שאלות קשורות:.*?\]/g, '')
      .replace(/\[סיכום:.*?\]/g, '')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 120);

    return {
      id: chunk.id,
      title: title.substring(0, 80),
      excerpt,
      thumbnail_url,
      topic: chunk.topic,
      entity_type: chunk.entity_type,
      updated_at: chunk.updated_at,
    };
  });

  return NextResponse.json({
    items,
    page: Math.floor(offset / limit) + 1,
    limit,
  });
}
