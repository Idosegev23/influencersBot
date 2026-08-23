/**
 * Reads `conversation_insights` for persona enrichment.
 *
 * This is the surviving half of the old conversation-learner: the reader was
 * always sound, the writer never worked. Its cron selected a column that does
 * not exist and the learner behind it read two permanently empty tables, so
 * this function has been returning empty arrays for every account since
 * migration 028. The table is now written by the weekly conversation-analytics
 * job (`src/lib/conversation-analytics/weekly.ts`), so these calls finally
 * return something.
 */

import { supabase } from '@/lib/supabase';

async function getTopInsights(accountId: string, type: string, limit: number): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_top_insights', {
    p_account_id: accountId,
    p_insight_type: type,
    p_limit: limit,
  });

  if (error) {
    console.error('[persona-insights] get_top_insights failed:', error.message);
    return [];
  }
  return data || [];
}

export async function getInsightsForPersona(accountId: string) {
  const [faqs, topics, painPoints, language] = await Promise.all([
    getTopInsights(accountId, 'faq', 5),
    getTopInsights(accountId, 'topic_interest', 5),
    getTopInsights(accountId, 'pain_point', 5),
    getTopInsights(accountId, 'language_pattern', 3),
  ]);

  return {
    frequentQuestions: faqs,
    hotTopics: topics,
    painPoints,
    audienceLanguage: language,
  };
}
