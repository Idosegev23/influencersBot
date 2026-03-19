/**
 * Sandwich Bot - The Complete System
 * מערכת הבוט המלאה עם כל 3 השכבות
 */

import { routeToArchetype } from './archetypes/intentRouter';
import { processWithArchetype } from './archetypes';
import { getInsightsForPersona } from './conversation-learner';
import {
  retrieveKnowledge as retrieveKnowledgeFromSources,
  formatKnowledgeForPrompt,
  hasRelevantKnowledge,
  type KnowledgeBase,
} from './knowledge-retrieval';

// Fallback suggestions per archetype when LLM omits <<SUGGESTIONS>>
const ARCHETYPE_FALLBACK_SUGGESTIONS: Record<string, string> = {
  cooking: 'מתכון מהיר|טיפ למטבח|מה הכי שווה לנסות?',
  skincare: 'שגרת טיפוח|מוצר מומלץ|טיפ לעור',
  fashion: 'מה ללבוש?|טרנד חדש|המלצה לאאוטפיט',
  fitness: 'אימון מהיר|טיפ לכושר|תוכנית אימונים',
  coupons: 'קופונים פעילים|מבצע חדש|הנחה למותג',
  general: 'ספרי לי עוד|יש קופון?|מה חדש?',
};

function getArchetypeFallbackSuggestions(archetype: string): string {
  return ARCHETYPE_FALLBACK_SUGGESTIONS[archetype] || ARCHETYPE_FALLBACK_SUGGESTIONS.general;
}

// ============================================
// Type Definitions
// ============================================

export interface SandwichBotInput {
  userMessage: string;
  accountId: string;
  username: string;
  influencerName: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  userName?: string;
  rollingSummary?: string; // Memory V2: conversation summary for context-aware retrieval
  modelTier?: 'nano' | 'standard' | 'full'; // From decision engine modelStrategy
  onToken?: (token: string) => void; // Real-time streaming callback
  personalityConfig?: any; // Pre-loaded personality (avoids DB call)
  previousResponseId?: string | null; // OpenAI Responses API: chain context
  mode?: 'widget' | 'social' | 'dm'; // Widget = sales-oriented, Social = engagement, DM = Instagram direct messages
  widgetConfig?: any; // Widget-specific config from accounts.config.widget
  fromSuggestion?: boolean; // Suggestion click — check DB cache for pre-generated response
}

export interface SandwichBotOutput {
  response: string;
  responseId?: string | null; // OpenAI Responses API response ID for context chaining
  metadata: {
    archetype: string;
    confidence: number;
    guardrailsTriggered: any[];
    personalityApplied: boolean;
  };
}

// ============================================
// Sandwich Bot Class
// ============================================

export class SandwichBot {
  /**
   * Process user message through all 3 layers
   */
  async process(input: SandwichBotInput): Promise<SandwichBotOutput> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 [SandwichBot] Processing message for @${input.username}`);
    console.log(`📝 Message: ${input.userMessage}`);
    console.log(`${'='.repeat(60)}`);

    // ==========================================
    // LAYER 2: Route to Archetype
    // ==========================================
    console.log('\n📍 [Layer 2] Routing to archetype...');
    
    const classification = await routeToArchetype({
      userMessage: input.userMessage,
      conversationHistory: input.conversationHistory,
      accountContext: {
        accountId: input.accountId,
        username: input.username,
      },
    });

    console.log(`   → Archetype: ${classification.primaryArchetype}`);
    console.log(`   → Confidence: ${(classification.confidence * 100).toFixed(0)}%`);

    // ==========================================
    // Retrieve Knowledge Base (with smart follow-up detection)
    // ==========================================
    console.log('\n📚 Retrieving knowledge...');

    const lastAssistant = input.conversationHistory?.length
      ? [...input.conversationHistory].reverse().find(m => m.role === 'assistant')
      : null;

    // Enrich query with conversation context for follow-up messages
    // e.g. "תני לי את המתכון" → "פסטה רביולי ... תני לי את המתכון"
    // Skip enrichment for suggestion clicks — they are standalone questions,
    // and prepending history pollutes the embedding search
    let knowledgeQuery = input.userMessage;

    // Enrich query with context — both for regular messages and suggestion clicks
    // Suggestions need context too: "שגרת טיפוח פנים" should find hair content if conversation is about hair
    const shouldEnrich = input.userMessage.length < 80;
    if (shouldEnrich) {
      const contextParts: string[] = [];

      if (input.mode === 'dm') {
        // DM: use last user messages as context (not bot responses which are long/noisy)
        // This helps follow-ups like "משרה מלאה?" connect to "מנהלת פרויקטים"
        const recentUserMsgs = (input.conversationHistory || [])
          .filter(m => m.role === 'user')
          .slice(-3);
        for (const msg of recentUserMsgs) {
          contextParts.push(msg.content.substring(0, 150));
        }
        // Add rolling summary for broader context
        if (input.rollingSummary) {
          contextParts.push(input.rollingSummary.substring(0, 200));
        }
      } else {
        // Widget: use rolling summary + last user messages for topic continuity
        if (input.rollingSummary) {
          contextParts.push(input.rollingSummary.substring(0, 200));
        }
        // Use recent user messages (not assistant — too long/noisy for embedding)
        const recentUserMsgs = (input.conversationHistory || [])
          .filter(m => m.role === 'user')
          .slice(-2);
        for (const msg of recentUserMsgs) {
          contextParts.push(msg.content.substring(0, 150));
        }
      }

      if (contextParts.length > 0) {
        knowledgeQuery = `${contextParts.join(' ')} ${input.userMessage}`;
        console.log(`   → Enriched query with conversation context (${knowledgeQuery.length} chars)${input.fromSuggestion ? ' [suggestion+context]' : ''}`);
      } else if (input.fromSuggestion) {
        console.log(`   → Suggestion click — no history available for enrichment`);
      }
    }

    let knowledgeBase: KnowledgeBase;
    knowledgeBase = await this.retrieveKnowledge(
      input.accountId,
      classification.primaryArchetype,
      knowledgeQuery,
      input.rollingSummary
    );

    // ==========================================
    // LAYER 2 + 3: Process with Archetype (includes Guardrails)
    // ==========================================
    console.log('\n🎯 [Layer 2+3] Processing with archetype + guardrails...');
    console.log(`   ⚡ Streaming mode: ${input.onToken ? 'YES' : 'NO'}`);
    
    const archetypeResult = await processWithArchetype(
      classification.primaryArchetype,
      input.userMessage,
      knowledgeBase,
      {
        conversationHistory: input.conversationHistory,
        userName: input.userName,
        accountContext: {
          accountId: input.accountId,
          username: input.username,
          influencerName: input.influencerName,
        },
        onToken: input.onToken,
        modelTier: input.modelTier,
        personalityConfig: input.personalityConfig,
        previousResponseId: input.previousResponseId,
        mode: input.mode,
        widgetConfig: input.widgetConfig,
      }
    );

    console.log(`   → Guardrails triggered: ${archetypeResult.triggeredGuardrails.length}`);
    
    if (archetypeResult.triggeredGuardrails.length > 0) {
      for (const guard of archetypeResult.triggeredGuardrails) {
        console.log(`      - ${guard.ruleId} (${guard.severity})`);
      }
    }

    // ==========================================
    // LAYER 1: Personality (already in system prompt — no post-hoc wrapper needed)
    // ==========================================
    console.log('\n✨ [Layer 1] Personality already in system prompt, skipping post-hoc wrapper');
    let finalResponse = archetypeResult.response;

    // ==========================================
    // Suggestion fallback: if LLM didn't produce <<SUGGESTIONS>>, add basic ones
    // ==========================================
    if (!finalResponse.includes('<<SUGGESTIONS>>')) {
      const fallbackSuggestions = getArchetypeFallbackSuggestions(classification.primaryArchetype);
      finalResponse += `\n<<SUGGESTIONS>>${fallbackSuggestions}<</SUGGESTIONS>>`;
      console.log('   → Added fallback suggestions (LLM omitted them)');
    }

    console.log(`   → Final response: ${finalResponse.substring(0, 100)}...`);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [SandwichBot] Processing complete`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      response: finalResponse,
      responseId: archetypeResult.responseId,
      metadata: {
        archetype: classification.primaryArchetype,
        confidence: classification.confidence,
        guardrailsTriggered: archetypeResult.triggeredGuardrails,
        personalityApplied: true,
      },
    };
  }

  /**
   * Retrieve relevant knowledge for the query
   */
  private async retrieveKnowledge(
    accountId: string,
    archetype: string,
    userMessage: string,
    rollingSummary?: string
  ): Promise<KnowledgeBase> {
    console.log(`   → Querying KB for archetype: ${archetype}`);

    // Retrieve from all sources (posts, highlights, coupons, insights, websites)
    const knowledgeBase = await retrieveKnowledgeFromSources(
      accountId,
      archetype as any,
      userMessage,
      10, // limit
      rollingSummary
    );

    // Log what we found
    if (hasRelevantKnowledge(knowledgeBase)) {
      console.log(`   ✅ Found relevant knowledge!`);
      console.log(`      Posts: ${knowledgeBase.posts.length}`);
      console.log(`      Coupons: ${knowledgeBase.coupons.length}`);
      console.log(`      Insights: ${knowledgeBase.insights.length}`);
    } else {
      console.log(`   ⚠️  No relevant knowledge found`);
    }

    return knowledgeBase;
  }

  /**
   * Detect if user switched topics (word overlap heuristic).
   * Mirrors the logic in BaseArchetype.isTopicChange.
   */
  private detectTopicChange(userMessage: string, lastAssistantReply: string): boolean {
    const STOP = new Set([
      'את','של','על','עם','זה','היא','הוא','אני','לי','לך','שלי','שלך',
      'מה','איך','למה','כמה','מתי','איפה','אם','גם','כל','הרבה','עוד',
      'יש','אין','היה','הזה','הזאת','אבל','רק','כן','לא','טוב','ממש',
      'בבקשה','תודה','אוקי','that','this','the','and','for','with','from',
    ]);
    const tokenise = (text: string): Set<string> => {
      const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
      return new Set(words);
    };
    const userWords = tokenise(userMessage);
    const assistantWords = tokenise(lastAssistantReply);
    if (userWords.size === 0) return false;
    let overlap = 0;
    for (const w of userWords) { if (assistantWords.has(w)) overlap++; }
    return (overlap / userWords.size) < 0.2;
  }

  /**
   * Get insights to enhance persona
   */
  async getEnhancedPersona(accountId: string): Promise<any> {
    const insights = await getInsightsForPersona(accountId);
    
    return {
      frequentQuestions: insights.frequentQuestions,
      hotTopics: insights.hotTopics,
      painPoints: insights.painPoints,
      audienceLanguage: insights.audienceLanguage,
    };
  }
}

// ============================================
// Singleton & Convenience Functions
// ============================================

let botInstance: SandwichBot | null = null;

export function getSandwichBot(): SandwichBot {
  if (!botInstance) {
    botInstance = new SandwichBot();
  }
  return botInstance;
}

/**
 * Process message with the full sandwich model
 */
export async function processSandwichMessage(
  input: SandwichBotInput
): Promise<string> {
  const bot = getSandwichBot();
  const result = await bot.process(input);
  return result.response;
}

/**
 * Process with metadata
 */
export async function processSandwichMessageWithMetadata(
  input: SandwichBotInput
): Promise<SandwichBotOutput> {
  const bot = getSandwichBot();
  return bot.process(input);
}
