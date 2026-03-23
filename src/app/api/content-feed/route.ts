import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Map influencer_type to the primary RAG topic to filter by
const TYPE_TO_TOPIC: Record<string, string> = {
  food: 'food',
  beauty: 'beauty',
  fashion: 'fashion',
  fitness: 'health',
  tech: 'tech',
  travel: 'lifestyle',
  parenting: 'lifestyle',
  lifestyle: 'lifestyle',
  other: 'lifestyle',
};

interface ContentCard {
  id: string;
  title: string;
  description: string;
  fullText: string;
  imageUrl: string | null;
  meta: Record<string, string>; // e.g. { time: '30 דק׳', items: '6 מרכיבים' }
  entityType: string;
  topic: string;
  shortcode: string | null;
}

/**
 * Decode HTML entities (&#8217; → ', &#8211; → –, &amp; → &, etc.)
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Extract a title from chunk text.
 * Website chunks often have "Title: ..." or "שם מוצר: ..." patterns.
 * Post chunks start with the caption.
 */
function extractTitle(text: string, entityType: string): string {
  // Try "Title: ..." pattern (website chunks)
  const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/);
  if (titleMatch) {
    // Remove site name suffix like " – דניאל עמית"
    return titleMatch[1].replace(/\s*[–-]\s*.{2,30}$/, '').trim();
  }

  // Try "שם מוצר: ..." pattern
  const productMatch = text.match(/שם מוצר:\s*(.+?)(?:\n|$)/);
  if (productMatch) return productMatch[1].trim();

  // For posts/transcriptions, take the first meaningful line
  const lines = text.split('\n').filter(l => l.trim().length > 5);
  if (lines.length > 0) {
    const first = lines[0].trim();
    return first.length > 60 ? first.slice(0, 57) + '...' : first;
  }

  return 'תוכן';
}

/**
 * Extract a description from chunk text.
 */
function extractDescription(text: string): string {
  // Try "Description: ..." or "תיאור: ..."
  const descMatch = text.match(/(?:Description|תיאור):\s*(.+?)(?:\n|$)/);
  if (descMatch) {
    const desc = descMatch[1].trim();
    return desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
  }

  // Try he_summary from metadata (handled at caller level)
  // Fallback: second meaningful line
  const lines = text.split('\n').filter(l => l.trim().length > 10);
  if (lines.length > 1) {
    const second = lines[1].trim();
    return second.length > 120 ? second.slice(0, 117) + '...' : second;
  }

  return '';
}

/**
 * Extract meta info based on content type.
 */
function extractMeta(text: string, topic: string): Record<string, string> {
  const meta: Record<string, string> = {};

  if (topic === 'food') {
    // Look for prep time
    const timeMatch = text.match(/זמן הכנה\s*(\d+)/);
    if (timeMatch) meta.time = `${timeMatch[1]} דק׳`;

    // Look for ingredients count
    const ingredientsMatch = text.match(/מרכיבים\s*(\d+)/);
    if (ingredientsMatch) meta.items = `${ingredientsMatch[1]} מרכיבים`;
  }

  if (topic === 'beauty' || topic === 'health') {
    // Look for steps
    const stepsMatch = text.match(/(\d+)\s*שלבים/);
    if (stepsMatch) meta.steps = `${stepsMatch[1]} שלבים`;
  }

  return meta;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const topicOverride = searchParams.get('topic'); // optional: force a specific topic
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const offset = parseInt(searchParams.get('offset') || '0');

  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const supabase = createClient();

  // Get account
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->>username', username)
    .limit(1);

  const account = accounts?.[0];
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const influencerType = account.config?.influencer_type || 'other';
  const topic = topicOverride || TYPE_TO_TOPIC[influencerType] || 'lifestyle';

  // Fetch topic-matched chunks (website/transcription with topic, posts may lack topic)
  const fetchLimit = Math.max(limit * 3, 60); // over-fetch to allow filtering junk
  const { data: topicChunks, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, entity_type, topic, metadata, token_count')
    .eq('account_id', account.id)
    .eq('topic', topic)
    .in('entity_type', ['website', 'post', 'transcription'])
    .order('token_count', { ascending: false })
    .limit(fetchLimit);

  // Also fetch post chunks with null topic (not yet enriched) as fallback
  const { data: nullTopicPosts } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, entity_type, topic, metadata, token_count')
    .eq('account_id', account.id)
    .is('topic', null)
    .eq('entity_type', 'post')
    .order('token_count', { ascending: false })
    .limit(fetchLimit);

  // Merge and sort: prioritize chunks with Title/שם מוצר patterns, then by token_count
  const allChunks = [...(topicChunks || []), ...(nullTopicPosts || [])];
  allChunks.sort((a, b) => {
    const aHasTitle = /Title:|שם מוצר:/.test(a.chunk_text) ? 1 : 0;
    const bHasTitle = /Title:|שם מוצר:/.test(b.chunk_text) ? 1 : 0;
    if (aHasTitle !== bHasTitle) return bHasTitle - aHasTitle;
    return (b.token_count || 0) - (a.token_count || 0);
  });

  // Apply pagination offset
  const chunks = allChunks.slice(offset, offset + fetchLimit);

  if (error) {
    console.error('[content-feed] DB error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ items: [], total: 0, topic, influencerType });
  }

  // Get shortcodes from chunks to fetch images from instagram_posts
  const shortcodes = chunks
    .map(c => c.metadata?.shortcode)
    .filter(Boolean) as string[];

  let postImages: Record<string, string> = {};
  if (shortcodes.length > 0) {
    const { data: posts } = await supabase
      .from('instagram_posts')
      .select('shortcode, media_urls, thumbnail_url')
      .eq('account_id', account.id)
      .in('shortcode', shortcodes);

    if (posts) {
      for (const p of posts) {
        const url = p.thumbnail_url || (p.media_urls as string[])?.[0] || null;
        if (url && p.shortcode) postImages[p.shortcode] = url;
      }
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  const items: ContentCard[] = [];

  for (const chunk of chunks) {
    // Skip junk: URL-encoded blobs, very short text, summary-only stubs
    const text = chunk.chunk_text || '';
    if (text.length < 40) continue;
    if (/%[0-9a-f]{2}/i.test(text.slice(0, 100)) && !text.includes('Title:')) continue;
    if (text.startsWith('[סיכום: null]') && !text.includes('Title:')) continue;

    const title = decodeHtmlEntities(extractTitle(text, chunk.entity_type));
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();

    if (seen.has(normalizedTitle) || title === 'תוכן') continue;
    if (items.length >= limit) break; // respect the actual limit
    seen.add(normalizedTitle);

    const shortcode = chunk.metadata?.shortcode || null;
    const imageUrl = shortcode ? (postImages[shortcode] || null) : null;
    const heSummary = chunk.metadata?.he_summary && chunk.metadata.he_summary !== 'null' ? chunk.metadata.he_summary : null;
    const description = decodeHtmlEntities(heSummary || extractDescription(text));
    const meta = extractMeta(text, topic);

    // Clean full text: strip metadata prefixes for display
    const fullText = decodeHtmlEntities(
      text
        .replace(/^Title:\s*.+?\n/m, '')
        .replace(/^Description:\s*.+?\n/m, '')
        .replace(/^\[סיכום:.*?\]\n?/m, '')
        .trim()
    );

    items.push({
      id: chunk.id,
      title,
      description,
      fullText,
      imageUrl,
      meta,
      entityType: chunk.entity_type,
      topic: chunk.topic || topic,
      shortcode,
    });
  }

  // Get total count for pagination
  const { count } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.id)
    .eq('topic', topic)
    .in('entity_type', ['website', 'post', 'transcription']);

  return NextResponse.json({
    items,
    total: count || 0,
    topic,
    influencerType,
    hasMore: offset + limit < (count || 0),
  });
}
