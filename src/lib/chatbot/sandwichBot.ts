/**
 * Sandwich Bot - The Complete System
 * מערכת הבוט המלאה עם כל 3 השכבות
 */

import { routeToArchetype } from './archetypes/intentRouter';
import { processWithArchetype } from './archetypes';
import { wrapResponseWithPersonality } from './personality-wrapper';
import { getInsightsForPersona } from './conversation-learner';
import { 
  retrieveKnowledge as retrieveKnowledgeFromSources,
  formatKnowledgeForPrompt,
  hasRelevantKnowledge,
  type KnowledgeBase,
} from './knowledge-retrieval';

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
  onToken?: (token: string) => void; // Real-time streaming callback
}

export interface SandwichBotOutput {
  response: string;
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

    // Detect quick follow-ups: user answering bot's question with a short choice
    // Only skip RAG for very short answers (< 10 chars) that don't contain content keywords
    const hasContentKeywords = /מתכון|איך|קופון|מוצר|המלצה|טיפ|שווארמה|פסטה|עוגה|סלט|מה ה/.test(input.userMessage);
    const isQuickFollowUp = !!(
      lastAssistant &&
      input.userMessage.length < 10 &&
      !hasContentKeywords &&
      lastAssistant.content.includes('?')
    );

    let knowledgeBase: KnowledgeBase;

    if (isQuickFollowUp) {
      // ⚡ Skip RAG entirely — conversation history has the context
      console.log('   ⚡ Quick follow-up detected — skipping RAG for speed');
      knowledgeBase = { posts: [], highlights: [], coupons: [], partnerships: [], insights: [], websites: [], transcriptions: [] };
    } else {
      // Enrich query with conversation context for follow-up messages
      // e.g. "תני לי את המתכון" → "פסטה רביולי ... תני לי את המתכון"
      let knowledgeQuery = input.userMessage;
      if (lastAssistant && input.userMessage.length < 60) {
        knowledgeQuery = `${lastAssistant.content.substring(0, 300)} ${input.userMessage}`;
        console.log(`   → Enriched query with conversation context (${knowledgeQuery.length} chars)`);
      }

      knowledgeBase = await this.retrieveKnowledge(
        input.accountId,
        classification.primaryArchetype,
        knowledgeQuery
      );
    }

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
      }
    );

    console.log(`   → Guardrails triggered: ${archetypeResult.triggeredGuardrails.length}`);
    
    if (archetypeResult.triggeredGuardrails.length > 0) {
      for (const guard of archetypeResult.triggeredGuardrails) {
        console.log(`      - ${guard.ruleId} (${guard.severity})`);
      }
    }

    // ==========================================
    // LAYER 1: Wrap with Personality
    // ==========================================
    let finalResponse: string;
    
    if (input.onToken) {
      // Streaming mode: personality is already in the prompt, skip wrapper
      console.log('\n✨ [Layer 1] Personality already in prompt (streaming mode), skipping wrapper');
      finalResponse = archetypeResult.response;
    } else {
      // Non-streaming mode: use personality wrapper (backward compatible)
      console.log('\n✨ [Layer 1] Wrapping with personality...');
      finalResponse = await wrapResponseWithPersonality(
        input.accountId,
        archetypeResult.response,
        classification.primaryArchetype,
        {
          userName: input.userName,
          conversationHistory: input.conversationHistory,
        }
      );
    }

    console.log(`   → Final response: ${finalResponse.substring(0, 100)}...`);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [SandwichBot] Processing complete`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      response: finalResponse,
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
    userMessage: string
  ): Promise<KnowledgeBase> {
    console.log(`   → Querying KB for archetype: ${archetype}`);

    // Retrieve from all sources (posts, highlights, coupons, insights, websites)
    const knowledgeBase = await retrieveKnowledgeFromSources(
      accountId,
      archetype as any,
      userMessage,
      10 // limit
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
