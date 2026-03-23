/**
 * AI Summary Generation for Hot Topics
 *
 * Uses Gemini Flash to generate concise Hebrew summaries
 * for trending topics based on post excerpts.
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

/**
 * Generate Hebrew summaries for hot topics that need one.
 * Only processes topics with score > 30 and no existing summary.
 */
export async function generateTopicSummaries(
  topicIds?: string[]
): Promise<{ summarized: number; errors: string[] }> {
  const supabase = createClient();
  const errors: string[] = [];

  // Load topics that need summaries
  let query = supabase
    .from('hot_topics')
    .select('id, topic_name, topic_type, tags')
    .gt('heat_score', 30)
    .is('summary', null)
    .order('heat_score', { ascending: false })
    .limit(10);

  if (topicIds?.length) {
    query = supabase
      .from('hot_topics')
      .select('id, topic_name, topic_type, tags')
      .in('id', topicIds)
      .limit(10);
  }

  const { data: topics } = await query;
  if (!topics || topics.length === 0) return { summarized: 0, errors };

  // For each topic, load the most relevant post excerpts
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { summarized: 0, errors: ['No GEMINI_API_KEY'] };

  const genai = new GoogleGenAI({ apiKey });
  let summarized = 0;

  for (const topic of topics) {
    try {
      // Get linked posts
      const { data: links } = await supabase
        .from('hot_topic_posts')
        .select('chunk_id, account_id')
        .eq('topic_id', topic.id)
        .order('relevance_score', { ascending: false })
        .limit(5);

      if (!links || links.length === 0) continue;

      const chunkIds = links.map((l: any) => l.chunk_id).filter(Boolean);
      if (chunkIds.length === 0) continue;

      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('chunk_text, account_id')
        .in('id', chunkIds);

      if (!chunks || chunks.length === 0) continue;

      // Get account names for context
      const accountIds = [...new Set(links.map((l: any) => l.account_id))];
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, config')
        .in('id', accountIds);

      const accountNames = (accounts || []).map(
        (a: any) => (a.config as any)?.display_name || (a.config as any)?.username || 'ערוץ'
      );

      const excerpts = chunks.map((c: any) => c.chunk_text.substring(0, 300)).join('\n---\n');

      const response = await genai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `אתה כתב חדשות בידור. כתוב תקציר של משפט אחד עד שניים בעברית על הנושא "${topic.topic_name}".
הנושא מסוג: ${topic.topic_type}
ערוצים שכיסו: ${accountNames.join(', ')}

קטעים רלוונטיים:
${excerpts}

כללים:
- משפט אחד עד שניים בלבד
- עברית טבעית, סגנון חדשותי-בידורי
- תייחס לעובדות שמופיעות בקטעים
- אל תמציא מידע שלא מופיע
- אל תוסיף אימוג'ים

תקציר:`,
        config: { temperature: 0.3, maxOutputTokens: 200 },
      });

      const summary = (response.text || '').trim();
      if (summary.length > 10) {
        await supabase
          .from('hot_topics')
          .update({ summary, updated_at: new Date().toISOString() })
          .eq('id', topic.id);
        summarized++;
      }
    } catch (err) {
      errors.push(`Topic ${topic.id}: ${(err as Error).message}`);
    }
  }

  return { summarized, errors };
}
