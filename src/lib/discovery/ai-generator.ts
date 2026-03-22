// ============================================
// Discovery Feature — AI List Generator
// ============================================

import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import type { DiscoveryItem } from './types';
import { CATEGORY_MAP, resolveCategoryTitle } from './categories';

const openai = new OpenAI();

// AI prompt templates per category slug
const PROMPTS: Record<string, string> = {
  'best-tips': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה את 5 הטיפים הכי טובים והשימושיים שהיא שיתפה.
לכל טיפ תן: כותרת קצרה (עד 60 תווים), תקציר (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,

  'behind-scenes': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה 5 רגעים/תכנים של מאחורי הקלעים — דברים אישיים, תהליכי יצירה, רגעים לא מתוכננים.
לכל פריט תן: כותרת קצרה (עד 60 תווים), תקציר (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,

  'personal-things': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה 5 דברים אישיים שהיא חשפה — הרגלים, דעות, חוויות אישיות, פחדים, חלומות.
לכל פריט תן: כותרת קצרה (עד 60 תווים), תקציר (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,

  'best-products': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה 5 מוצרים שהיא הכי ממליצה עליהם או משתמשת בהם.
לכל מוצר תן: שם המוצר ככותרת (עד 60 תווים), תקציר של ההמלצה (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,

  'best-places': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה 5 מקומות (מסעדות, ערים, יעדי טיול, חנויות) שהיא הזכירה או ביקרה בהם.
לכל מקום תן: שם המקום ככותרת (עד 60 תווים), תקציר (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,

  'truth-or-lie': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, צור משחק "אמת או שקר" — 5 טענות, חלקן אמת וחלקן שקר (מבוסס על תוכן אמיתי + המצאה סבירה).
לכל טענה תן: את הטענה ככותרת (עד 60 תווים), ואת התשובה (אמת/שקר + הסבר קצר עד 200 תווים).
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "אמת/שקר: ...", "shortcode": "..." }]}`,

  'common-mistakes': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה 5 טעויות נפוצות שהיא מזהירה מהן או מתקנת אצל העוקבים.
לכל טעות תן: כותרת קצרה (עד 60 תווים), הסבר (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,

  'daily-habits': `אתה מנתח תוכן של משפיענית בשם {name}.
מתוך הפוסטים והתמלולים הבאים, זהה 5 הרגלים יומיומיים או שגרות שהיא שיתפה.
לכל הרגל תן: כותרת קצרה (עד 60 תווים), תקציר (עד 200 תווים), ואת ה-shortcode של הפוסט המקורי.
החזר JSON object: {"items": [{ "rank": 1, "aiTitle": "...", "aiSummary": "...", "shortcode": "..." }]}`,
};

/**
 * Load content for AI analysis — posts + transcriptions
 */
async function loadContentForAnalysis(accountId: string): Promise<string> {
  const supabase = createClient();

  const [postsRes, transcRes] = await Promise.all([
    supabase
      .from('instagram_posts')
      .select('shortcode, post_url, caption, type, posted_at, likes_count, views_count')
      .eq('account_id', accountId)
      .order('engagement_rate', { ascending: false })
      .limit(100),
    supabase
      .from('instagram_transcriptions')
      .select('source_id, transcription_text, source_type')
      .eq('account_id', accountId)
      .eq('processing_status', 'completed')
      .limit(50),
  ]);

  const posts = postsRes.data || [];
  const transcriptions = transcRes.data || [];

  // Build context string
  let context = '=== פוסטים ===\n';
  for (const p of posts) {
    context += `\n[${p.shortcode}] (${p.type}, ${p.posted_at?.slice(0, 10)})\n`;
    context += `${p.caption?.slice(0, 500) || '(ללא כיתוב)'}\n`;
    if (p.likes_count) context += `לייקים: ${p.likes_count}`;
    if (p.views_count) context += ` | צפיות: ${p.views_count}`;
    context += '\n';
  }

  if (transcriptions.length > 0) {
    context += '\n=== תמלולים ===\n';
    for (const t of transcriptions) {
      context += `\n[${t.source_type}] ${t.transcription_text?.slice(0, 800) || ''}\n`;
    }
  }

  // Trim to ~15K chars to stay within token limits
  return context.slice(0, 15000);
}

/**
 * Enrich AI items with post data (thumbnails, URLs)
 */
async function enrichWithPostData(accountId: string, items: any[]): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const shortcodes = items.map(i => i.shortcode).filter(Boolean);

  if (shortcodes.length === 0) {
    return items.map((item, i) => ({
      rank: item.rank || i + 1,
      aiTitle: item.aiTitle || '',
      aiSummary: item.aiSummary || '',
      captionExcerpt: item.aiSummary || '',
    }));
  }

  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('shortcode, id, post_url, thumbnail_url, media_urls, type, posted_at')
    .eq('account_id', accountId)
    .in('shortcode', shortcodes);

  const postMap = new Map((posts || []).map(p => [p.shortcode, p]));

  return items.map((item, i) => {
    const post = postMap.get(item.shortcode);
    const isVideo = post?.type === 'reel' || post?.type === 'video';
    const videoUrl = isVideo && post?.media_urls?.length ? post.media_urls[0] : undefined;
    return {
      rank: item.rank || i + 1,
      postId: post?.id,
      shortcode: item.shortcode,
      postUrl: post?.post_url,
      videoUrl,
      thumbnailUrl: post?.thumbnail_url || (!isVideo && post?.media_urls?.[0]),
      captionExcerpt: item.aiSummary || '',
      mediaType: post?.type,
      postedAt: post?.posted_at,
      aiTitle: item.aiTitle,
      aiSummary: item.aiSummary,
    };
  });
}

/**
 * Generate a single AI-powered discovery list
 */
export async function generateAIList(
  accountId: string,
  slug: string,
  influencerName: string
): Promise<DiscoveryItem[]> {
  const promptTemplate = PROMPTS[slug];
  if (!promptTemplate) {
    console.warn(`[Discovery AI] No prompt template for slug: ${slug}`);
    return [];
  }

  const category = CATEGORY_MAP.get(slug);
  if (!category) return [];

  console.log(`[Discovery AI] Generating "${slug}" for ${influencerName}`);

  const content = await loadContentForAnalysis(accountId);
  if (content.length < 200) {
    console.warn(`[Discovery AI] Not enough content for ${slug}`);
    return [];
  }

  const systemPrompt = promptTemplate.replace(/\{name\}/g, influencerName);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON array from response
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error(`[Discovery AI] Failed to parse response for ${slug}`);
        return [];
      }
    }

    const items = Array.isArray(parsed) ? parsed : parsed.items || parsed.results || [];
    if (items.length === 0) return [];

    // Enrich with post data
    const enriched = await enrichWithPostData(accountId, items);
    return enriched.slice(0, 5);
  } catch (err) {
    console.error(`[Discovery AI] Generation failed for ${slug}:`, err);
    return [];
  }
}

/**
 * Generate all AI lists for an account and save to DB
 */
export async function generateAllAILists(accountId: string, influencerName: string): Promise<number> {
  const supabase = createClient();
  const aiSlugs = Object.keys(PROMPTS);
  let generated = 0;

  // Load content once for all categories
  for (const slug of aiSlugs) {
    try {
      const items = await generateAIList(accountId, slug, influencerName);
      if (items.length < 3) {
        console.log(`[Discovery AI] Skipping ${slug} — only ${items.length} items`);
        continue;
      }

      const category = CATEGORY_MAP.get(slug)!;
      const title = resolveCategoryTitle(category.titleTemplate, influencerName);

      await supabase
        .from('discovery_lists')
        .upsert({
          account_id: accountId,
          category_slug: slug,
          category_type: 'ai_generated',
          title_he: title,
          items,
          item_count: items.length,
          generation_model: 'gpt-4o-mini',
          influencer_name: influencerName,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'account_id,category_slug' });

      generated++;
      console.log(`[Discovery AI] ✓ Generated ${slug} with ${items.length} items`);
    } catch (err) {
      console.error(`[Discovery AI] Failed ${slug}:`, err);
    }
  }

  return generated;
}
