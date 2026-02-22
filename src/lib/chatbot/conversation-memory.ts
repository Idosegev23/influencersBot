/**
 * Conversation Memory Module
 *
 * Provides rolling summary generation and memory-augmented history
 * for multi-turn conversations. Gated behind MEMORY_V2_ENABLED.
 *
 * Uses Gemini 3 Flash for cheap/fast summary generation.
 */

import { chatWithGemini } from '@/lib/gemini-chat';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUMMARY_UPDATE_INTERVAL = 6; // Update summary every N messages
const MAX_SUMMARY_TOKENS = 300; // Approximate token budget for summary
const HISTORY_WINDOW = 12; // Messages to keep in recent window
const RETRY_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMemory {
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  rollingSummary: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build conversation context for a session.
 * Returns recent messages + rolling summary if available.
 */
export async function buildConversationContext(
  sessionId: string,
  currentHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<ConversationMemory> {
  // Load rolling summary from DB
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('rolling_summary')
    .eq('id', sessionId)
    .single();

  return {
    recentMessages: currentHistory.slice(-HISTORY_WINDOW),
    rollingSummary: session?.rolling_summary || null,
  };
}

/**
 * Determine if the rolling summary should be updated based on message count.
 */
export function shouldUpdateSummary(messageCount: number): boolean {
  // Early summary for short sessions (msg 3), then at intervals: 6, 12, 18, 24, ...
  return messageCount === 3 || (messageCount > 0 && messageCount % SUMMARY_UPDATE_INTERVAL === 0);
}

/**
 * Generate/update the rolling summary for a session.
 * Uses Gemini 3 Flash for cheap, fast summarization.
 * Includes retry with exponential backoff.
 *
 * Fire-and-forget — caller should not await this in the response path.
 */
export async function updateRollingSummary(
  sessionId: string,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  persona?: any,
): Promise<void> {
  const startMs = Date.now();

  // Load current summary
  const { data: session, error: loadError } = await supabase
    .from('chat_sessions')
    .select('rolling_summary')
    .eq('id', sessionId)
    .single();

  if (loadError) {
    console.error('[Memory] Failed to load session for summary', {
      sessionId,
      error: loadError.message,
    });
    return;
  }

  const existingSummary = session?.rolling_summary || '';

  // Build message transcript for the LLM
  const transcript = recentMessages
    .slice(-HISTORY_WINDOW)
    .map(m => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.content}`)
    .join('\n');

  const prompt = buildSummaryPrompt(existingSummary, transcript);

  // Retry loop with exponential backoff
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        console.log(`[Memory] Retry attempt ${attempt}/${RETRY_ATTEMPTS}`, { sessionId });
      }

      const result = await chatWithGemini({
        message: prompt,
        persona: persona || { display_name: 'System', archetype: 'assistant' },
        context: '',
        conversationHistory: [],
      });

      const newSummary = result.text.trim();

      // Persist to DB
      const { error: writeError } = await supabase
        .from('chat_sessions')
        .update({ rolling_summary: newSummary })
        .eq('id', sessionId);

      if (writeError) {
        throw new Error(`DB write failed: ${writeError.message}`);
      }

      const durationMs = Date.now() - startMs;
      console.log('[Memory] Summary updated', {
        sessionId,
        attempt,
        durationMs,
        summaryLength: newSummary.length,
      });
      return; // Success — exit

    } catch (err) {
      lastError = err;
    }
  }

  // All retries exhausted
  const durationMs = Date.now() - startMs;
  console.error('[Memory] Summary update failed after retries', {
    sessionId,
    attempts: RETRY_ATTEMPTS + 1,
    durationMs,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildSummaryPrompt(existingSummary: string, transcript: string): string {
  const base = existingSummary
    ? `סיכום קודם של השיחה:\n${existingSummary}\n\n`
    : '';

  return `${base}הודעות אחרונות בשיחה:\n${transcript}\n\n---\nצור סיכום קצר ומדויק של השיחה (עד 4 משפטים). הסיכום חייב לכלול:
1. מטרות המשתמש — מה הוא רוצה לדעת/להשיג
2. החלטות שהתקבלו — מה סוכם
3. עובדות מרכזיות — מידע חשוב שעלה (שמות מותגים, קופונים, מספרים)
4. שאלות פתוחות — מה עדיין לא נענה

אם יש סיכום קודם, עדכן אותו (לא להתחיל מחדש). כתוב בעברית. תמציתי.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Token Budget
// ---------------------------------------------------------------------------

// Rough estimate: ~4 chars per token for mixed Hebrew/English content
const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_TOKENS = 12_000; // Conservative budget for history+summary portion
const MIN_HISTORY_MESSAGES = 4; // Always keep at least 4 recent messages

/**
 * Estimate token count from text length.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Trim conversation payload to fit within token budget.
 * Drops oldest history messages first, then truncates summary if needed.
 * Returns the trimmed messages array and metadata.
 */
export function trimToTokenBudget(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  rollingSummary: string | null,
  maxTokens: number = MAX_CONTEXT_TOKENS,
): {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  rollingSummary: string | null;
  trimmedCount: number;
  estimatedTokens: number;
} {
  let totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (rollingSummary) totalTokens += estimateTokens(rollingSummary);

  let trimmedCount = 0;
  const result = [...messages];

  // Phase 1: Drop oldest history messages (keep at least MIN_HISTORY_MESSAGES)
  while (totalTokens > maxTokens && result.length > MIN_HISTORY_MESSAGES) {
    const removed = result.shift()!;
    totalTokens -= estimateTokens(removed.content);
    trimmedCount++;
  }

  // Phase 2: Truncate summary if still over budget
  let trimmedSummary = rollingSummary;
  if (totalTokens > maxTokens && trimmedSummary) {
    const summaryBudget = Math.max(200, maxTokens - totalTokens + estimateTokens(trimmedSummary));
    const maxChars = summaryBudget * CHARS_PER_TOKEN;
    if (trimmedSummary.length > maxChars) {
      trimmedSummary = trimmedSummary.substring(0, maxChars) + '...';
      totalTokens = result.reduce((sum, m) => sum + estimateTokens(m.content), 0) + estimateTokens(trimmedSummary);
    }
  }

  return {
    messages: result,
    rollingSummary: trimmedSummary,
    trimmedCount,
    estimatedTokens: totalTokens,
  };
}
