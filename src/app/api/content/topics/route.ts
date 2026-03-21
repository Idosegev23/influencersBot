import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/content/topics?username=X&topic=beauty
 *
 * Returns cleaned document titles as tappable questions for the topic tab.
 * Groups by entity_type (articles, videos, posts).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const topic = searchParams.get('topic'); // optional filter

  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const supabase = createClient();

  // Get account
  const { data: account } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->>username', username)
    .eq('status', 'active')
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const displayName = account.config?.display_name || username;

  // Get first chunk per document with title
  let query = supabase
    .from('document_chunks')
    .select(`
      id,
      document_id,
      entity_type,
      topic,
      chunk_text,
      updated_at,
      documents!inner(id, title)
    `)
    .eq('account_id', account.id)
    .eq('chunk_index', 0)
    .not('entity_type', 'eq', 'coupon')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (topic) {
    query = query.eq('topic', topic);
  }

  const { data: chunks, error } = await query;

  if (error) {
    console.error('[content/topics] Query error:', error.message);
    return NextResponse.json({ groups: [] });
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  // Clean and deduplicate titles
  const seen = new Set<string>();
  const items: { title: string; question: string; entityType: string; topic: string }[] = [];

  for (const chunk of chunks) {
    const doc = Array.isArray(chunk.documents) ? chunk.documents[0] : chunk.documents;
    let title = (doc as any)?.title || '';

    // Clean title
    title = cleanTitle(title, displayName);

    // Skip bad titles
    if (!title || title.length < 3 || title.length > 100) continue;
    if (title.toLowerCase().includes('archives')) continue;
    if (title === 'חנות' || title === 'בית' || title === 'ראשי') continue;

    const normalizedTitle = title.toLowerCase().trim();
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);

    // Build natural question from title
    const question = buildQuestion(title, chunk.entity_type);

    items.push({
      title,
      question,
      entityType: chunk.entity_type,
      topic: chunk.topic,
    });
  }

  // Group by entity type with Hebrew labels
  const groupMap: Record<string, { title: string; question: string }[]> = {};
  const groupLabels: Record<string, string> = {
    website: 'מאמרים',
    transcription: 'סרטונים',
    post: 'פוסטים',
    partnership: 'שיתופי פעולה',
  };

  for (const item of items) {
    const groupKey = item.entityType;
    if (!groupMap[groupKey]) groupMap[groupKey] = [];
    groupMap[groupKey].push({ title: item.title, question: item.question });
  }

  // Build ordered groups (articles first, then videos, then posts)
  const groupOrder = ['website', 'transcription', 'post', 'partnership'];
  const groups = groupOrder
    .filter(key => groupMap[key]?.length > 0)
    .map(key => ({
      label: groupLabels[key] || key,
      items: groupMap[key].slice(0, 30), // max 30 per group
    }));

  return NextResponse.json({ groups });
}

/**
 * Remove influencer name suffixes, site names, and clean up titles.
 */
function cleanTitle(title: string, displayName: string): string {
  let clean = title;

  // Remove common suffixes: " - Name | Full Name", " – Name"
  const patterns = [
    /\s*[-–|]\s*TheDekel\s*\|.*$/i,
    /\s*[-–|]\s*דקל ורד.*$/,
    /\s*[-–]\s*דניאל עמית.*$/,
    /\s*[-–|]\s*Danielle Amit.*$/i,
    new RegExp(`\\s*[-–|]\\s*${escapeRegex(displayName)}.*$`, 'i'),
    /\s*[-–|]\s*\w+\.\w+\.\w+.*$/, // remove domain suffixes
    /\s*\|\s*$/,
    /\s*[-–]\s*$/,
  ];

  for (const pattern of patterns) {
    clean = clean.replace(pattern, '');
  }

  // Remove "Partnership: " prefix
  clean = clean.replace(/^Partnership:\s*/i, '');

  // Trim
  clean = clean.trim();

  return clean;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a natural Hebrew question from a content title.
 */
function buildQuestion(title: string, entityType: string): string {
  // For recipes / food
  if (title.match(/מתכון|פסטה|עוגה|סלט|מרק|אורז|עוף|בשר|דג/)) {
    return `איך מכינים ${title}?`;
  }

  // For reviews / products
  if (title.match(/סקירת|ביקורת|review/i)) {
    return `מה דעתך על ${title}?`;
  }

  // Default
  return `ספרו לי על ${title}`;
}
