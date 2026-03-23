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
  home: 'home',
  media_news: 'lifestyle',
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
  sourceUrl: string | null; // website source URL or Instagram post URL
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
 * Strip HTML/CSS/JS junk from website-scraped chunk text.
 * Keeps only readable Hebrew/English recipe content.
 */
function cleanWebContent(text: string): string {
  // ── Step 0: Hard cut at known junk boundaries (before any regex) ──
  // Cut at JSON fragment leak: `" }` or `"}`
  const jsonLeakIdx = text.indexOf('" }');
  if (jsonLeakIdx !== -1 && jsonLeakIdx > 200) {
    text = text.slice(0, jsonLeakIdx).trim();
  }
  const jsonLeakIdx2 = text.indexOf('"}');
  if (jsonLeakIdx2 !== -1 && jsonLeakIdx2 > 200) {
    text = text.slice(0, jsonLeakIdx2).trim();
  }

  // ── Step 1: Strip HTML/CSS/JS blocks ──
  let cleaned = text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[.#][a-zA-Z_][\w\s.:#>,~+\-\[\]=*"'^$()]*\{[^}]*\}/g, '')
    .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '')
    .replace(/jQuery[\s\S]*$/g, '')  // Everything from jQuery onwards is junk
    .replace(/localStorage[\s\S]*$/g, '')
    .replace(/var\s+\w+\s*=[\s\S]*?;/g, '')
    .replace(/function\s*\w*\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
    .replace(/\/\*[^*]*\*\//g, '')
    .replace(/https?:\/\/\S+/g, '')
    // Cut at nutrition table / popup junk
    .replace(/ערכים תזונתיים[\s\S]*/g, '')
    .replace(/מידע נוסף מידע נוסף[\s\S]*/g, '')
    .replace(/×\s*תודה שנרשמת[\s\S]*/g, '')
    // Clean CSS property fragments
    .replace(/[a-z\-]+:\s*[#\d]+px[^;\n]*;/g, '')
    .replace(/[a-z\-]+:\s*#[0-9a-f]+[^;\n]*;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n(\s*\n)+/g, '\n\n');

  // ── Step 2: Deduplicate sections ──
  // If "אופן הכנה" appears twice, keep only the first occurrence + its content
  const prepIdx = cleaned.indexOf('אופן הכנה');
  if (prepIdx !== -1) {
    const secondIdx = cleaned.indexOf('אופן הכנה', prepIdx + 10);
    if (secondIdx !== -1) {
      cleaned = cleaned.slice(0, secondIdx).trim();
    }
  }

  // ── Step 3: Line-level cleanup ──
  const lines = cleaned.split('\n');
  const cleanLines = lines.filter(line => {
    const t = line.trim();
    if (t.length < 2) return false;
    if (/^[.#@][\w-]+$/.test(t)) return false; // CSS selector
    if (/^[{};]$/.test(t)) return false;
    if (/^\/\*/.test(t)) return false;
    if (/^(success|jQuery|localStorage|let |const |if\s*\(|var )/.test(t)) return false;
    if (t.length < 3 && !/[\u0590-\u05FF\d]/.test(t)) return false;
    // Skip repeated nutrition summary lines
    if (/^\w+\s+\d+\.\d+\s+(קק״ל|גרם|מ״ג)/.test(t)) return false;
    // Skip "סגור" (close button text)
    if (t === 'סגור') return false;
    return true;
  });

  return cleanLines.join('\n').trim();
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
    // Look for total time: "זמן כולל: 13 שעות ו-20 דק׳" or "זמן כולל13 שעות..."
    const totalTimeMatch = text.match(/זמן כולל[:\s]*(\d+\s*שעות?(?:\s*ו[-\s]*\d+\s*דק[׳']?)?|\d+\s*דק[׳']?)/);
    if (totalTimeMatch) {
      meta.time = totalTimeMatch[1].trim();
    } else {
      // Fallback: "זמן הכנה 30" (minutes only)
      const prepMatch = text.match(/זמן הכנה[:\s]*(\d+)/);
      if (prepMatch) meta.time = `${prepMatch[1]} דק׳`;
    }

    // Look for ingredients count: "מרכיבים: 29" or "מרכיבים29" or "מרכיבים 29"
    const ingredientsMatch = text.match(/מרכיבים[:\s]*(\d+)/);
    if (ingredientsMatch) meta.items = `${ingredientsMatch[1]} מרכיבים`;

    // Difficulty level
    const diffMatch = text.match(/רמת קושי[:\s]*(בסיסי|קל|בינוני|מתקדם|קשה)/);
    if (diffMatch) meta.difficulty = diffMatch[1];

    // Servings
    const servingsMatch = text.match(/כמות מנות[:\s]*(\d+)/);
    if (servingsMatch) meta.servings = `${servingsMatch[1]} מנות`;
  }

  if (topic === 'beauty' || topic === 'health') {
    // Look for steps
    const stepsMatch = text.match(/(\d+)\s*שלבים/);
    if (stepsMatch) meta.steps = `${stepsMatch[1]} שלבים`;
  }

  return meta;
}

// ─── Fashion-specific feed: pull from Instagram data directly ───

async function handleFashionFeed(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  limit: number,
  offset: number,
) {
  // 1. Fetch highlight collections with item counts
  const { data: highlights } = await supabase
    .from('instagram_highlights')
    .select('id, title')
    .eq('account_id', accountId);

  const hlTitleMap: Record<string, string> = {};
  if (highlights) highlights.forEach(h => { hlTitleMap[h.id] = h.title; });

  // 2. Fetch highlight items with thumbnails (the actual look images)
  const { data: hlItems } = await supabase
    .from('instagram_highlight_items')
    .select('id, highlight_id, thumbnail_url, media_type, posted_at')
    .eq('account_id', accountId)
    .not('thumbnail_url', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(200);

  // 3. Fetch Instagram posts with images
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, caption, thumbnail_url, media_urls, mentions, is_sponsored, likes_count, posted_at')
    .eq('account_id', accountId)
    .not('thumbnail_url', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(100);

  // 4. Get transcription descriptions for highlight items (for richer text)
  const hlItemIds = (hlItems || []).map(h => h.id);
  let transcriptionMap: Record<string, string> = {};
  if (hlItemIds.length > 0) {
    // Fetch in batches of 200 IDs to match against originalSourceId
    const batchSize = 200;
    for (let i = 0; i < hlItemIds.length; i += batchSize) {
      const batch = hlItemIds.slice(i, i + batchSize);
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('metadata, chunk_text')
        .eq('account_id', accountId)
        .eq('entity_type', 'transcription')
        .in('metadata->>originalSourceId', batch)
        .limit(500);

      if (chunks) {
        for (const c of chunks) {
          const srcId = c.metadata?.originalSourceId;
          if (srcId && !transcriptionMap[srcId]) {
            const text = (c.chunk_text || '').replace(/^\[סיכום:.*?\]\s*/m, '').trim();
            if (text.length > 20) {
              transcriptionMap[srcId] = text; // full text, not truncated
            }
          }
        }
      }
    }
  }

  // 5. Build unified items list
  const items: ContentCard[] = [];

  // Add highlight items as look cards
  for (const hi of (hlItems || [])) {
    const brand = hlTitleMap[hi.highlight_id] || '';
    // Skip non-fashion highlights (TV shows, books, etc.)
    const skipTitles = ['📚', 'המרוץ למליון', 'המירוץ למליון', 'אהבת אמת'];
    if (skipTitles.some(t => brand.includes(t))) continue;

    const fullTranscription = transcriptionMap[hi.id] || '';
    // Short description for the card display
    const shortDesc = fullTranscription.length > 150
      ? fullTranscription.slice(0, 147) + '...'
      : fullTranscription;
    // Extract a short title from the description or use brand
    const titleFromDesc = fullTranscription.split(/[|.\n]/).find(s => s.trim().length > 3)?.trim();
    const title = titleFromDesc
      ? (titleFromDesc.length > 60 ? titleFromDesc.slice(0, 57) + '...' : titleFromDesc)
      : brand;

    const meta: Record<string, string> = {};
    if (brand) meta.brand = brand;
    // Extract size from transcription if available
    const sizeMatch = fullTranscription.match(/מידה\s+(xs|s|m|l|xl|xxl|\d+)/i);
    if (sizeMatch) meta.size = `מידה ${sizeMatch[1].toUpperCase()}`;

    items.push({
      id: hi.id,
      title,
      description: shortDesc,
      fullText: fullTranscription, // full content for the chatbot
      imageUrl: hi.thumbnail_url,
      meta,
      entityType: 'highlight',
      topic: 'fashion',
      shortcode: null,
      sourceUrl: null,
    });
  }

  // Add Instagram posts as look cards
  for (const post of (posts || [])) {
    const caption = (post.caption || '').trim();
    const firstLine = caption.split('\n')[0]?.trim() || '';
    const title = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : (firstLine || 'פוסט');
    const description = caption.length > 150 ? caption.slice(0, 147) + '...' : caption;

    const meta: Record<string, string> = {};
    // Extract brand from mentions
    const mentions = (post.mentions || []) as string[];
    if (mentions.length > 0) {
      meta.brand = mentions[0].replace(/^@/, '');
    }
    if (post.is_sponsored) meta.sponsored = 'שיתוף פעולה';
    if (post.likes_count) meta.likes = `${post.likes_count} ❤️`;

    const imageUrl = post.thumbnail_url || ((post.media_urls as string[])?.[0]) || null;

    items.push({
      id: post.id,
      title,
      description,
      fullText: caption,
      imageUrl,
      meta,
      entityType: 'post',
      topic: 'fashion',
      shortcode: post.shortcode,
      sourceUrl: post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : null,
    });
  }

  // Sort by variety: interleave highlights and posts
  // First highlights (brand looks), then posts
  const total = items.length;
  const paginated = items.slice(offset, offset + limit);

  return NextResponse.json({
    items: paginated,
    total,
    topic: 'fashion',
    influencerType: 'fashion',
    hasMore: offset + limit < total,
  });
}

// ─── Generic (non-fashion) feed from document_chunks ───

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

  // Fashion accounts use a completely different data source
  if (influencerType === 'fashion') {
    return handleFashionFeed(supabase, account.id, limit, offset);
  }

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

  // Also fetch null-topic posts as fallback
  const { data: nullTopicPosts } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, entity_type, topic, metadata, token_count')
    .eq('account_id', account.id)
    .is('topic', null)
    .in('entity_type', ['post'])
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

    // Image resolution: shortcode→post thumbnail, metadata→image_url
    let imageUrl: string | null = null;
    if (shortcode && postImages[shortcode]) {
      imageUrl = postImages[shortcode];
    } else {
      imageUrl = chunk.metadata?.image_url || null;
    }

    const heSummary = chunk.metadata?.he_summary && chunk.metadata.he_summary !== 'null' ? chunk.metadata.he_summary : null;
    const description = decodeHtmlEntities(heSummary || extractDescription(text));
    const meta = extractMeta(text, topic);

    // Clean full text: strip metadata prefixes + meta fields already in pills + HTML/CSS/JS junk
    const rawText = text
      .replace(/^Title:\s*.+?\n/m, '')
      .replace(/^Description:\s*.+?\n/m, '')
      .replace(/^\[סיכום:.*?\]\n?/m, '')
      .replace(/^זמן כולל:.*$/m, '')
      .replace(/^כמות מנות:.*$/m, '')
      .replace(/^רמת קושי:.*$/m, '')
      .replace(/^קלוריות:.*$/m, '')
      .trim();
    const fullText = decodeHtmlEntities(
      chunk.entity_type === 'website' ? cleanWebContent(rawText) : rawText
    );

    // Source URL: Instagram post link or website source
    const sourceUrl = shortcode
      ? `https://www.instagram.com/p/${shortcode}/`
      : (chunk.metadata?.source_url || null);

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
      sourceUrl,
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
