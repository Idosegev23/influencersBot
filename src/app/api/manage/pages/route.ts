/**
 * CRUD /api/manage/pages
 * Scraped website pages management for website owners
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateManageSession } from '@/lib/manage/auth';

/**
 * GET — list scraped pages
 * Query params: ?search=keyword
 */
export async function GET(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const supabase = await createClient();
    let query = supabase
      .from('instagram_bio_websites')
      .select('id, url, page_title, page_description, page_content, word_count, processing_status, scraped_at, created_at, image_urls, extracted_data')
      .eq('account_id', session.accountId)
      .order('created_at', { ascending: false });

    const { data: pages, error } = await query;

    if (error) {
      console.error('[ManagePages] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
    }

    // Get RAG document info for these pages
    const { data: docs } = await supabase
      .from('documents')
      .select('id, source_id, chunk_count, total_tokens')
      .eq('account_id', session.accountId)
      .eq('entity_type', 'website');

    // Build a map of source_id → doc info
    const docMap = new Map<string, any>();
    for (const doc of (docs || [])) {
      if (doc.source_id) {
        docMap.set(doc.source_id, doc);
      }
    }

    // Enrich pages with RAG info
    const enrichedPages = (pages || []).map((page: any) => {
      const sourceKey = `url-${page.id}`;
      const ragDoc = docMap.get(sourceKey) || docMap.get(page.url);
      // Pick the best thumbnail: extracted_data images > image_urls > null
      const extractedImages = page.extracted_data?.images || [];
      const pageImages = page.image_urls || [];
      const thumbnail = extractedImages[0] || pageImages[0] || null;

      return {
        ...page,
        // Truncate content for listing
        page_content: page.page_content?.substring(0, 500) || '',
        hasFullContent: (page.page_content?.length || 0) > 500,
        ragChunks: ragDoc?.chunk_count || 0,
        ragTokens: ragDoc?.total_tokens || 0,
        ragDocId: ragDoc?.id || null,
        thumbnail,
        productName: page.extracted_data?.name || null,
      };
    });

    // Filter by search if provided
    let filtered = enrichedPages;
    if (search) {
      const s = search.toLowerCase();
      filtered = enrichedPages.filter((p: any) =>
        p.page_title?.toLowerCase().includes(s) ||
        p.url?.toLowerCase().includes(s) ||
        p.page_content?.toLowerCase().includes(s)
      );
    }

    return NextResponse.json({ success: true, pages: filtered });
  } catch (error: any) {
    console.error('[ManagePages] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH — edit page content
 * Body: { id, page_title?, page_content?, page_description? }
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

    const allowedFields = ['page_title', 'page_content', 'page_description'];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Recalculate word count if content changed
    if (safeUpdates.page_content) {
      safeUpdates.word_count = safeUpdates.page_content.split(/\s+/).filter(Boolean).length;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('instagram_bio_websites')
      .update(safeUpdates)
      .eq('id', id)
      .eq('account_id', session.accountId)
      .select('id, url, page_title, page_description, word_count')
      .single();

    if (error) {
      console.error('[ManagePages] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update page', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, page: data });
  } catch (error: any) {
    console.error('[ManagePages] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE — delete page + associated RAG documents/chunks
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

    // Get the page URL before deleting (for RAG cleanup)
    const { data: page } = await supabase
      .from('instagram_bio_websites')
      .select('id, url')
      .eq('id', id)
      .eq('account_id', session.accountId)
      .single();

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Delete associated RAG document + chunks (CASCADE handles chunks)
    const sourceKey = `url-${page.id}`;
    await supabase
      .from('documents')
      .delete()
      .eq('account_id', session.accountId)
      .eq('entity_type', 'website')
      .or(`source_id.eq.${sourceKey},source_id.eq.${page.url}`);

    // Delete the page itself
    const { error } = await supabase
      .from('instagram_bio_websites')
      .delete()
      .eq('id', id)
      .eq('account_id', session.accountId);

    if (error) {
      console.error('[ManagePages] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete page', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ManagePages] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
