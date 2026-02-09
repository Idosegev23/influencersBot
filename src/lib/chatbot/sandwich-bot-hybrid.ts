/**
 * Sandwich Bot with Hybrid Multi-Stage Retrieval
 * 
 * Flow:
 * 1. User asks question
 * 2. AI sees metadata (cheap!)
 * 3. AI requests specific content (function call)
 * 4. Fetch only what's needed
 * 5. AI answers with full context
 */

import { GoogleGenerativeAI, FunctionDeclaration, Tool } from '@google/generative-ai';
import { 
  searchContentByQuery, 
  fetchDetailedContent, 
  formatMetadataForAI,
  formatDetailedContentForAI,
  type RetrievalRequest,
  type ContentMetadata 
} from './hybrid-retrieval';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// ============================================
// Function Declarations for AI
// ============================================

const fetchContentFunction: FunctionDeclaration = {
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
};

const contentTool: Tool = {
  functionDeclarations: [fetchContentFunction],
};

// ============================================
// Main Hybrid Bot Function
// ============================================

export async function processWithHybridRetrieval(
  accountId: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  console.log('\n🥪 [Hybrid Sandwich Bot] Starting...');
  console.log(`📝 Message: ${userMessage.substring(0, 50)}...`);

  try {
    // ============================================
    // Stage 1: Smart Indexed Search! ⚡
    // ============================================
    console.log('\n🔍 [Stage 1] Searching indexed content...');
    const metadata = await searchContentByQuery(accountId, userMessage);
    const metadataPrompt = formatMetadataForAI(metadata);

    // ============================================
    // Stage 2: AI Decides What to Fetch
    // ============================================
    console.log('\n🤖 [Stage 2] AI analyzing metadata...');
    
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [contentTool],
    });

    const chat = model.startChat({
      history: conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
    });

    // Build initial prompt with metadata
    const stage2Prompt = `אתה עוזר וירטואלי של משפיענית. המשתמש שאל:
"${userMessage}"

${metadataPrompt}

⚠️ עכשיו תחליט: אילו פריטי תוכן אתה צריך לראות במלואם כדי לענות על השאלה?

אם אתה צריך תוכן מפורט:
1. קרא לפונקציה fetch_detailed_content עם IDs רלוונטיים
2. אני אביא את התוכן המלא
3. אז תענה על השאלה

אם אין צורך בתוכן מפורט (למשל: שאלה כללית):
- פשוט ענה ישירות

תחשוב היטב - שלוף רק מה שבאמת צריך! ⚡`;

    const result = await chat.sendMessage(stage2Prompt);
    const response = result.response;

    // Check if AI requested function call
    const functionCalls = response.functionCalls();
    
    if (!functionCalls || functionCalls.length === 0) {
      // No function call needed - direct answer
      console.log('✅ [Stage 2] AI answered directly (no content fetch needed)');
      return response.text();
    }

    // ============================================
    // Stage 3: Fetch Detailed Content
    // ============================================
    console.log('\n📥 [Stage 3] AI requested detailed content...');
    
    const functionCall = functionCalls[0];
    const request: RetrievalRequest = functionCall.args as RetrievalRequest;
    
    console.log(`  Posts: ${request.posts?.length || 0}`);
    console.log(`  Transcriptions: ${request.transcriptions?.length || 0}`);
    console.log(`  Highlights: ${request.highlights?.length || 0}`);
    console.log(`  Stories: ${request.stories?.length || 0}`);

    const detailedContent = await fetchDetailedContent(accountId, request);
    const detailedPrompt = formatDetailedContentForAI(detailedContent);

    // ============================================
    // Stage 4: AI Answers with Full Context
    // ============================================
    console.log('\n💬 [Stage 4] AI generating final answer...');

    // Send function response back to AI
    const finalResult = await chat.sendMessage([{
      functionResponse: {
        name: 'fetch_detailed_content',
        response: {
          content: detailedPrompt,
          itemsRetrieved: detailedContent.length,
        },
      },
    }]);

    const finalAnswer = finalResult.response.text();
    
    console.log('✅ [Hybrid Bot] Complete!');
    console.log(`📊 Stats: Metadata: ${metadata.length}, Detailed: ${detailedContent.length}`);
    
    return finalAnswer;

  } catch (error) {
    console.error('❌ [Hybrid Bot] Error:', error);
    return 'מצטערת, נתקלתי בבעיה טכנית. נסי שוב בעוד רגע! 🙏';
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
  console.log('\n🥪✨ [Hybrid + Persona Bot] Starting...');

  try {
    // Stage 1: Smart indexed search
    const metadata = await searchContentByQuery(accountId, userMessage);
    const metadataPrompt = formatMetadataForAI(metadata);

    // Stage 2: AI with personality
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [contentTool],
      systemInstruction: `אתה עוזר וירטואלי של ${influencerName}.
סגנון דיבור: ${tone}

כללים:
1. תשובה קצרה (3-4 משפטים)
2. אם צריך מידע ספציפי - קרא fetch_detailed_content
3. אל תמציא מידע שאין לך!
4. אם אין מידע רלוונטי - תגיד בכנות
5. 1-2 אימוג'ים מקסימום`,
    });

    const chat = model.startChat({
      history: conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
    });

    const stage2Prompt = `${metadataPrompt}

שאלת המשתמש: "${userMessage}"

החלט אם אתה צריך תוכן מפורט, או שאתה יכול לענות ישירות.`;

    const result = await chat.sendMessage(stage2Prompt);
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      return response.text();
    }

    // Stage 3: Fetch detailed
    const functionCall = functionCalls[0];
    const request: RetrievalRequest = functionCall.args as RetrievalRequest;
    const detailedContent = await fetchDetailedContent(accountId, request);
    const detailedPrompt = formatDetailedContentForAI(detailedContent);

    // Stage 4: Final answer
    const finalResult = await chat.sendMessage([{
      functionResponse: {
        name: 'fetch_detailed_content',
        response: {
          content: detailedPrompt,
          itemsRetrieved: detailedContent.length,
        },
      },
    }]);

    return finalResult.response.text();

  } catch (error) {
    console.error('❌ [Hybrid + Persona Bot] Error:', error);
    return 'מצטערת, נתקלתי בבעיה. נסי שוב! 🙏';
  }
}
