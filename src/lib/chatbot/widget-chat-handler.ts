/**
 * Widget Chat Handler
 * מטפל בהודעות צ'אט מהווידג'ט — ניטרלי, בלי פרסונה
 * מחפש רק בתוכן אתרים (לא אינסטגרם)
 */

import { createClient } from '@/lib/supabase/server';

// ============================================
// Type Definitions
// ============================================

export interface WidgetChatParams {
  accountId: string;
  message: string;
  sessionId?: string;
  onToken?: (token: string) => void;
}

export interface WidgetChatResult {
  response: string;
  sessionId: string;
}

// ============================================
// Main Handler
// ============================================

export async function processWidgetMessage(params: WidgetChatParams): Promise<WidgetChatResult> {
  const { accountId, message, onToken } = params;
  const supabase = await createClient();

  // 1. Get or create session
  let sessionId = params.sessionId;
  if (!sessionId) {
    sessionId = `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await supabase.from('chat_sessions').insert({
      id: sessionId,
      account_id: accountId,
      message_count: 0,
    });
  }

  // 2. Retrieve relevant website content via FTS
  const websiteContext = await retrieveWebsiteContext(supabase, accountId, message);

  // 3. Get conversation history (last 10 messages)
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(10);

  const conversationHistory = (history || []).reverse();

  // 4. Build system prompt
  const systemPrompt = buildWidgetSystemPrompt(websiteContext);

  // 5. Generate response via Gemini
  const { getGeminiClient, MODELS } = await import('@/lib/ai/google-client');
  const client = getGeminiClient();

  const contents = [
    ...conversationHistory.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];

  let fullText = '';

  const stream = await client.models.generateContentStream({
    model: MODELS.CHAT_LITE,
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 1000,
      temperature: 0.7,
    },
  });

  for await (const chunk of stream) {
    const token = chunk.text || '';
    if (token) {
      fullText += token;
      onToken?.(token);
    }
  }

  // 6. Save messages
  await Promise.all([
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
    }),
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: fullText,
    }),
  ]);

  return { response: fullText, sessionId };
}

// ============================================
// Website Context Retrieval
// ============================================

async function retrieveWebsiteContext(
  supabase: any,
  accountId: string,
  query: string,
): Promise<string> {
  try {
    // FTS search on website content
    const { data: ftsResults } = await supabase.rpc('search_website_content', {
      p_account_id: accountId,
      p_query: query,
      p_limit: 5,
    });

    if (!ftsResults || ftsResults.length === 0) {
      // Fallback: get most recent pages
      const { data: pages } = await supabase
        .from('instagram_bio_websites')
        .select('page_title, page_content, url, image_urls')
        .eq('account_id', accountId)
        .eq('source_type', 'standalone')
        .eq('processing_status', 'completed')
        .order('scraped_at', { ascending: false })
        .limit(5);

      if (!pages || pages.length === 0) return '';

      return pages
        .map((p: any) => `## ${p.page_title || p.url}\n${(p.page_content || '').slice(0, 2000)}`)
        .join('\n\n---\n\n');
    }

    return ftsResults
      .map((r: any) => `## ${r.page_title || r.url}\n${(r.page_content || '').slice(0, 2000)}`)
      .join('\n\n---\n\n');
  } catch (error: any) {
    console.error('[WidgetChat] Context retrieval failed:', error.message);
    return '';
  }
}

// ============================================
// System Prompt Builder
// ============================================

function buildWidgetSystemPrompt(websiteContext: string): string {
  return `אתה עוזר חכם שעונה על שאלות לגבי האתר.
עליך לענות אך ורק על בסיס תוכן האתר שמופיע למטה.
אם אין לך מידע רלוונטי, אמור בנימוס שאין לך מספיק מידע לענות על השאלה.
אל תמציא מידע.
התאם את שפת התשובה לשפת השואל.
ענה בצורה תמציתית ומועילה.

=== תוכן האתר ===
${websiteContext || 'לא נמצא תוכן רלוונטי.'}
=== סוף תוכן האתר ===`;
}
