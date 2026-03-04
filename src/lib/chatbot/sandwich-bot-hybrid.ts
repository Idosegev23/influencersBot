/**
 * Sandwich Bot with Hybrid Multi-Stage Retrieval
 *
 * Flow:
 * 1. User asks question
 * 2. AI sees metadata (cheap!)
 * 3. AI requests specific content (function call)
 * 4. Fetch only what's needed
 * 5. AI answers with full context
 *
 * Using Gemini Flash with function calling
 */

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';
import {
  searchContentByQuery,
  fetchDetailedContent,
  formatMetadataForAI,
  formatDetailedContentForAI,
  type RetrievalRequest,
  type ContentMetadata
} from './hybrid-retrieval';

// ============================================
// Function Declarations for Gemini
// ============================================

const functionDeclarations = [
  {
    name: 'fetch_detailed_content',
    description: 'שלוף תוכן מלא של פוסטים, תמלולים או הילייטס ספציפיים לפי ID. השתמש בזה אחרי שראית את ה-metadata וקבעת מה רלוונטי.',
    parameters: {
      type: 'object' as const,
      properties: {
        posts: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'רשימת IDs של פוסטים לשליפה',
        },
        transcriptions: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'רשימת IDs של תמלולים לשליפה',
        },
        highlights: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'רשימת IDs של הילייטס לשליפה',
        },
        stories: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'רשימת IDs של סטוריז לשליפה',
        },
      },
    },
  },
];

// ============================================
// Main Hybrid Bot Function
// ============================================

export async function processWithHybridRetrieval(
  accountId: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  console.log('\n[Hybrid Sandwich Bot] Starting with Gemini Flash...');
  console.log(`Message: ${userMessage.substring(0, 50)}...`);

  try {
    // ============================================
    // Stage 1: Smart Indexed Search!
    // ============================================
    console.log('\n[Stage 1] Searching indexed content...');
    const metadata = await searchContentByQuery(accountId, userMessage);
    const metadataPrompt = formatMetadataForAI(metadata);

    // ============================================
    // Stage 2: AI Decides What to Fetch
    // ============================================
    console.log('\n[Stage 2] Gemini analyzing metadata...');

    const systemInstruction = `אתה עוזר וירטואלי של משפיענית. אם צריך תוכן מפורט - קרא fetch_detailed_content. אם לא - ענה ישירות.
אל תשתמש ב-[שם] או placeholders.`;

    // Build contents
    const contents = [
      ...conversationHistory.map(msg => ({
        role: (msg.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: `אתה עוזר וירטואלי של משפיענית. המשתמש שאל:
"${userMessage}"

${metadataPrompt}

עכשיו תחליט: אילו פריטי תוכן אתה צריך לראות במלואם כדי לענות על השאלה?

אם אתה צריך תוכן מפורט:
1. קרא לפונקציה fetch_detailed_content עם IDs רלוונטיים
2. אני אביא את התוכן המלא
3. אז תענה על השאלה

אם אין צורך בתוכן מפורט (למשל: שאלה כללית):
- פשוט ענה ישירות

תחשוב היטב - שלוף רק מה שבאמת צריך!` }],
      },
    ];

    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: MODELS.CHAT_FAST,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations }],
      },
    });

    // Check if AI requested function call
    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      // No function call needed - direct answer
      console.log('[Stage 2] AI answered directly (no content fetch needed)');
      return response.text || 'מצטערת, לא הצלחתי להבין. נסי שוב?';
    }

    // ============================================
    // Stage 3: Fetch Detailed Content
    // ============================================
    console.log('\n[Stage 3] AI requested detailed content...');

    const call = functionCalls[0];
    const request: RetrievalRequest = call.args as any;

    console.log(`  Posts: ${request.posts?.length || 0}`);
    console.log(`  Transcriptions: ${request.transcriptions?.length || 0}`);
    console.log(`  Highlights: ${request.highlights?.length || 0}`);
    console.log(`  Stories: ${request.stories?.length || 0}`);

    const detailedContent = await fetchDetailedContent(accountId, request);
    const detailedPrompt = formatDetailedContentForAI(detailedContent);

    // ============================================
    // Stage 4: AI Answers with Full Context
    // ============================================
    console.log('\n[Stage 4] Gemini generating final answer...');

    // Send function response back to AI
    const finalContents = [
      ...contents,
      {
        role: 'model' as const,
        parts: [{ functionCall: { name: call.name, args: call.args } }],
      },
      {
        role: 'user' as const,
        parts: [{ functionResponse: { name: call.name, response: { content: detailedPrompt, itemsRetrieved: detailedContent.length } } }],
      },
    ];

    const finalResponse = await client.models.generateContent({
      model: MODELS.CHAT_FAST,
      contents: finalContents,
      config: {
        systemInstruction,
      },
    });

    const finalAnswer = finalResponse.text || 'מצטערת, לא הצלחתי להשלים.';

    console.log('[Hybrid Bot] Complete!');
    console.log(`Stats: Metadata: ${metadata.length}, Detailed: ${detailedContent.length}`);

    return finalAnswer;

  } catch (error) {
    console.error('[Hybrid Bot] Error:', error);
    return 'מצטערת, נתקלתי בבעיה טכנית. נסי שוב בעוד רגע!';
  }
}

// ============================================
// Enhanced Version with Persona & Guardrails
// ============================================

export async function processWithHybridAndPersona(
  accountId: string,
  userMessage: string,
  influencerName: string,
  tone: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  console.log('\n[Hybrid + Persona Bot] Starting with Gemini Flash...');

  try {
    // Stage 1: Smart indexed search
    const metadata = await searchContentByQuery(accountId, userMessage);
    const metadataPrompt = formatMetadataForAI(metadata);

    // Stage 2: Gemini with personality
    const systemInstruction = `אתה ${influencerName}, מנהל/ת שיחה טבעית.
סגנון דיבור: ${tone}
אל תפתח/י כל הודעה עם כינויי חיבה ("מאמי", "אהובה"). תפתח/י ישר לעניין.

כללים:
1. שאלות רחבות → שאל/י שאלה מכוונת ("שמנת או עגבניות?"). שאלות ספציפיות → ענה ישר.
2. אם צריך מידע ספציפי - קרא fetch_detailed_content
3. אל תמציא מתכונים, מצרכים, מידות, שמות מותגים או כל מידע שלא נמצא בתוכן שניתן!
4. אם יש תוכן בהקשר — **חובה לשתף אותו**. אם אין בכלל — אמור בקצרה ותזמין ל-DM
5. 1-2 אימוג'ים מקסימום
6. לעולם אל תשתמש ב-[שם המשפיענית] - השתמש בשם שלך: ${influencerName}
7. אל תענה תשובות גנריות כמו "זה פצצה" - תן ערך מהתוכן שלך בלבד!
8. **תמיד** תבין/י הפניות להיסטוריה — "המתכון", "מה שאמרת" = מה שדובר קודם.
9. בסוף **כל** תשובה, הוסף שורה אחרונה: <<SUGGESTIONS>>הצעה 1|הצעה 2|הצעה 3<</SUGGESTIONS>> — 2-3 הצעות קצרות שקשורות ישירות לשיחה.`;

    const contents = [
      ...conversationHistory.map(msg => ({
        role: (msg.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: `${metadataPrompt}

שאלת המשתמש: "${userMessage}"

החלט אם אתה צריך תוכן מפורט, או שאתה יכול לענות ישירות.` }],
      },
    ];

    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: MODELS.CHAT_FAST,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations }],
      },
    });

    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      return response.text || 'מצטערת, לא הצלחתי להבין. נסי שוב?';
    }

    // Stage 3: Fetch detailed
    const call = functionCalls[0];
    const request: RetrievalRequest = call.args as any;

    console.log(`\n[Stage 3] Fetching: ${request.posts?.length || 0} posts, ${request.transcriptions?.length || 0} transcriptions`);

    const detailedContent = await fetchDetailedContent(accountId, request);
    const detailedPrompt = formatDetailedContentForAI(detailedContent);

    // Stage 4: Final answer with context
    const finalContents = [
      ...contents,
      {
        role: 'model' as const,
        parts: [{ functionCall: { name: call.name, args: call.args } }],
      },
      {
        role: 'user' as const,
        parts: [{ functionResponse: { name: call.name, response: { content: detailedPrompt, itemsRetrieved: detailedContent.length } } }],
      },
    ];

    const finalResponse = await client.models.generateContent({
      model: MODELS.CHAT_FAST,
      contents: finalContents,
      config: {
        systemInstruction,
      },
    });

    console.log('[Hybrid + Persona Bot] Complete!');
    return finalResponse.text || 'מצטערת, נתקלתי בבעיה.';

  } catch (error) {
    console.error('[Hybrid + Persona Bot] Error:', error);
    return 'מצטערת, נתקלתי בבעיה. נסי שוב!';
  }
}
