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
 * 🚀 Now using GPT-5 Nano - FASTEST + CHEAPEST!
 */

import OpenAI from 'openai';
import { 
  searchContentByQuery, 
  fetchDetailedContent, 
  formatMetadataForAI,
  formatDetailedContentForAI,
  type RetrievalRequest,
  type ContentMetadata 
} from './hybrid-retrieval';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// Function Declarations for OpenAI
// ============================================

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_detailed_content',
      description: 'שלוף תוכן מלא של פוסטים, תמלולים או הילייטס ספציפיים לפי ID. השתמש בזה אחרי שראית את ה-metadata וקבעת מה רלוונטי.',
      parameters: {
        type: 'object',
        properties: {
          posts: {
            type: 'array',
            items: { type: 'string' },
            description: 'רשימת IDs של פוסטים לשליפה',
          },
          transcriptions: {
            type: 'array',
            items: { type: 'string' },
            description: 'רשימת IDs של תמלולים לשליפה',
          },
          highlights: {
            type: 'array',
            items: { type: 'string' },
            description: 'רשימת IDs של הילייטס לשליפה',
          },
          stories: {
            type: 'array',
            items: { type: 'string' },
            description: 'רשימת IDs של סטוריז לשליפה',
          },
        },
        required: [],
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
  console.log('\n🥪 [Hybrid Sandwich Bot] Starting with GPT-5 Nano...');
  console.log(`📝 Message: ${userMessage.substring(0, 50)}...`);

  try {
    // ============================================
    // Stage 1: Smart Indexed Search! ⚡
    // ============================================
    console.log('\n🔍 [Stage 1] Searching indexed content...');
    const metadata = await searchContentByQuery(accountId, userMessage);
    const metadataPrompt = formatMetadataForAI(metadata);

    // ============================================
    // Stage 2: AI Decides What to Fetch (GPT-5 Nano)
    // ============================================
    console.log('\n🤖 [Stage 2] GPT-5 Nano analyzing metadata...');
    
    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `אתה עוזר וירטואלי של יוצר/ת תוכן. אם צריך תוכן מפורט - קרא fetch_detailed_content. אם לא - ענה ישירות.
אל תשתמש ב-[שם] או placeholders.`,
      },
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user',
        content: `אתה עוזר וירטואלי של יוצר/ת תוכן. המשתמש שאל:
"${userMessage}"

${metadataPrompt}

⚠️ עכשיו תחליט: אילו פריטי תוכן אתה צריך לראות במלואם כדי לענות על השאלה?

אם אתה צריך תוכן מפורט:
1. קרא לפונקציה fetch_detailed_content עם IDs רלוונטיים
2. אני אביא את התוכן המלא
3. אז תענה על השאלה

אם אין צורך בתוכן מפורט (למשל: שאלה כללית):
- פשוט ענה ישירות

תחשוב היטב - שלוף רק מה שבאמת צריך! ⚡`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages,
      tools,
      // GPT-5 Nano only supports temperature: 1 (default)
    });

    const message = response.choices[0].message;

    // Check if AI requested function call
    if (!message.tool_calls || message.tool_calls.length === 0) {
      // No function call needed - direct answer
      console.log('✅ [Stage 2] AI answered directly (no content fetch needed)');
      return message.content || 'מצטער/ת, לא הצלחתי להבין. נסה/י שוב?';
    }

    // ============================================
    // Stage 3: Fetch Detailed Content
    // ============================================
    console.log('\n📥 [Stage 3] AI requested detailed content...');
    
    const toolCall = message.tool_calls[0];
    const request: RetrievalRequest = JSON.parse(toolCall.function.arguments);
    
    console.log(`  Posts: ${request.posts?.length || 0}`);
    console.log(`  Transcriptions: ${request.transcriptions?.length || 0}`);
    console.log(`  Highlights: ${request.highlights?.length || 0}`);
    console.log(`  Stories: ${request.stories?.length || 0}`);

    const detailedContent = await fetchDetailedContent(accountId, request);
    const detailedPrompt = formatDetailedContentForAI(detailedContent);

    // ============================================
    // Stage 4: AI Answers with Full Context
    // ============================================
    console.log('\n💬 [Stage 4] GPT-5 Nano generating final answer...');

    // Send function response back to AI
    const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...messages,
      message,
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          content: detailedPrompt,
          itemsRetrieved: detailedContent.length,
        }),
      },
    ];

    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: finalMessages,
      // GPT-5 Nano only supports temperature: 1 (default)
    });

    const finalAnswer = finalResponse.choices[0].message.content || 'מצטער/ת, לא הצלחתי להשלים.';
    
    console.log('✅ [Hybrid Bot] Complete!');
    console.log(`📊 Stats: Metadata: ${metadata.length}, Detailed: ${detailedContent.length}`);
    
    return finalAnswer;

  } catch (error) {
    console.error('❌ [Hybrid Bot] Error:', error);
    return 'מצטער/ת, נתקלתי בבעיה טכנית. נסה/י שוב בעוד רגע! 🙏';
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
  console.log('\n🥪✨ [Hybrid + Persona Bot] Starting with GPT-5 Nano...');

  try {
    // Stage 1: Smart indexed search
    const metadata = await searchContentByQuery(accountId, userMessage);
    const metadataPrompt = formatMetadataForAI(metadata);

    // Stage 2: GPT-5 Nano with personality
    const systemPrompt = `אתה ${influencerName}, מנהל/ת שיחה טבעית.
סגנון דיבור: ${tone}
⚠️ אל תפתח/י כל הודעה עם כינויי חיבה ("מאמי", "אהובה"). תפתח/י ישר לעניין.

כללים:
1. שאלות רחבות → שאל/י שאלה מכוונת ("שמנת או עגבניות?"). שאלות ספציפיות → ענה ישר.
2. אם צריך מידע ספציפי - קרא fetch_detailed_content
3. 🚨 אל תמציא מתכונים, מצרכים, מידות, שמות מותגים או כל מידע שלא נמצא בתוכן שניתן!
4. אם יש תוכן בהקשר — **חובה לשתף אותו**. אם אין בכלל — אמור בקצרה ותזמין ל-DM
5. 1-2 אימוג'ים מקסימום
6. לעולם אל תשתמש ב-[שם המשפיענית] - השתמש בשם שלך: ${influencerName}
7. אל תענה תשובות גנריות כמו "זה פצצה" - תן ערך מהתוכן שלך בלבד!
8. **תמיד** תבין/י הפניות להיסטוריה — "המתכון", "מה שאמרת" = מה שדובר קודם.
9. בסוף **כל** תשובה, הוסף שורה אחרונה: <<SUGGESTIONS>>הצעה 1|הצעה 2|הצעה 3<</SUGGESTIONS>> — 2-3 הצעות קצרות שקשורות ישירות לשיחה.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user',
        content: `${metadataPrompt}

שאלת המשתמש: "${userMessage}"

החלט אם אתה צריך תוכן מפורט, או שאתה יכול לענות ישירות.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages,
      tools,
      // GPT-5 Nano only supports temperature: 1 (default)
    });

    const message = response.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || 'מצטער/ת, לא הצלחתי להבין. נסה/י שוב?';
    }

    // Stage 3: Fetch detailed
    const toolCall = message.tool_calls[0];
    const request: RetrievalRequest = JSON.parse(toolCall.function.arguments);
    
    console.log(`\n📥 [Stage 3] Fetching: ${request.posts?.length || 0} posts, ${request.transcriptions?.length || 0} transcriptions`);
    
    const detailedContent = await fetchDetailedContent(accountId, request);
    const detailedPrompt = formatDetailedContentForAI(detailedContent);

    // Stage 4: Final answer with context
    const finalMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...messages,
      message,
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          content: detailedPrompt,
          itemsRetrieved: detailedContent.length,
        }),
      },
    ];

    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: finalMessages,
      // GPT-5 Nano only supports temperature: 1 (default)
    });

    console.log('✅ [Hybrid + Persona Bot] Complete with GPT-5 Nano!');
    return finalResponse.choices[0].message.content || 'מצטער/ת, נתקלתי בבעיה.';

  } catch (error) {
    console.error('❌ [Hybrid + Persona Bot] Error:', error);
    return 'מצטער/ת, נתקלתי בבעיה. נסה/י שוב! 🙏';
  }
}
