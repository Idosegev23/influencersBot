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
  // Step 1: Find the last numbered instruction step and cut everything after it
  // Pattern: last line starting with a number followed by period/dot like "14. ..."
  const lastStepMatch = text.match(/^(\d+)\.\s+.+$/gm);
  if (lastStepMatch && lastStepMatch.length > 2) {
    const lastStep = lastStepMatch[lastStepMatch.length - 1];
    const lastStepIdx = text.lastIndexOf(lastStep);
    if (lastStepIdx !== -1) {
      // Keep everything up to and including the last step
      text = text.slice(0, lastStepIdx + lastStep.length);
    }
  }

  let cleaned = text
    // Remove JSON-like fragments: "} מרכיבים 29..." pattern
    .replace(/"\s*\}\s*מרכיבים\s*\d+[\s\S]*/g, '')
    // Remove <style>...</style> and <script>...</script> blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove CSS blocks: .className { ... } and #id { ... }
    .replace(/[.#][a-zA-Z_][\w\s.:#>,~+\-\[\]=*"'^$()]*\{[^}]*\}/g, '')
    .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Remove jQuery/JS/localStorage patterns
    .replace(/jQuery[\s\S]*?(?:\}\);|\}\))/g, '')
    .replace(/localStorage\.\w+\([^)]*\)/g, '')
    .replace(/var\s+\w+\s*=[\s\S]*?;/g, '')
    .replace(/function\s*\w*\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
    // Remove CSS property lines
    .replace(/[a-z\-]+:\s*[#\d]+px[^;\n]*;/g, '')
    .replace(/[a-z\-]+:\s*#[0-9a-f]+[^;\n]*;/g, '')
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove nutrition table fragments: "קלוריות 755.8 קק״ל..."
    .replace(/ערכים תזונתיים[\s\S]*?סגור/g, '')
    .replace(/מידע נוסף[\s\S]*?סגור/g, '')
    // Remove "× תודה שנרשמת" subscription popups
    .replace(/×[\s\S]*?כפתור האימות/g, '')
    // Remove /\* CSS comments \*/
    .replace(/\/\*[^*]*\*\//g, '')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n(\s*\n)+/g, '\n\n');

  // Deduplicate: if "אופן הכנה" appears multiple times, keep only the first block
  const prepIdx = cleaned.indexOf('אופן הכנה');
  if (prepIdx !== -1) {
    const secondIdx = cleaned.indexOf('אופן הכנה', prepIdx + 10);
    if (secondIdx !== -1) {
      cleaned = cleaned.slice(0, secondIdx).trim();
    }
  }

  // Also deduplicate "מרכיבים" — if the ingredients list appears twice
  const ingIdx = cleaned.indexOf('מרכיבים');
  if (ingIdx !== -1) {
    // Look for a second "מרכיבים" that isn't part of "X מרכיבים" (count)
    const afterFirst = cleaned.slice(ingIdx + 7);
    const secondIngMatch = afterFirst.match(/(?:^|\n)\s*(?:חמין|חיטה|אורז|ג'חנון|ביצים)\s/m);
    // If we find section headers repeating, it's a duplicate
    const secondIngIdx = afterFirst.indexOf('\nמרכיבים');
    if (secondIngIdx !== -1) {
      cleaned = cleaned.slice(0, ingIdx + 7 + secondIngIdx).trim();
    }
  }

  // Line-level cleanup
  const lines = cleaned.split('\n');
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.length < 2) return false;
    // Skip CSS/JS fragments
    if (/^[.#@][\w-]+/.test(trimmed) && !trimmed.includes(' ')) return false;
    if (/^\w+\(/.test(trimmed) && !trimmed.match(/^\d/)) return false;
    if (/^[{};]$/.test(trimmed)) return false;
    if (/^\/\*/.test(trimmed)) return false;
    // Skip "success:" or "jQuery" leftovers
    if (/^(success|jQuery|localStorage|let |const |if\s*\()/.test(trimmed)) return false;
    // Skip single symbols
    if (trimmed.length < 3 && !/[\u0590-\u05FF\d]/.test(trimmed)) return false;
    // Skip nutrition data lines like "קלוריות 755.8 קק״ל 9069.7 קק״ל"
    if (/^\w+\s+\d+\.\d+\s+(קק״ל|גרם|מ״ג)/.test(trimmed)) return false;
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
    // Image: Instagram posts use shortcode→thumbnail, website chunks use metadata.image_url
    const imageUrl = shortcode
      ? (postImages[shortcode] || null)
      : (chunk.metadata?.image_url || null);
    const heSummary = chunk.metadata?.he_summary && chunk.metadata.he_summary !== 'null' ? chunk.metadata.he_summary : null;
    const description = decodeHtmlEntities(heSummary || extractDescription(text));
    const meta = extractMeta(text, topic);

    // Clean full text: strip metadata prefixes + HTML/CSS/JS junk
    const rawText = text
      .replace(/^Title:\s*.+?\n/m, '')
      .replace(/^Description:\s*.+?\n/m, '')
      .replace(/^\[סיכום:.*?\]\n?/m, '')
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
