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
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  userName?: string;
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
    // Retrieve Knowledge Base
    // ==========================================
    console.log('\n📚 Retrieving knowledge...');
    
    // TODO: Implement RAG retrieval based on archetype
    const knowledgeBase = await this.retrieveKnowledge(
      input.accountId,
      classification.primaryArchetype,
      input.userMessage
    );

    // ==========================================
    // LAYER 2 + 3: Process with Archetype (includes Guardrails)
    // ==========================================
    console.log('\n🎯 [Layer 2+3] Processing with archetype + guardrails...');
    
    const archetypeResult = await processWithArchetype(
      classification.primaryArchetype,
      input.userMessage,
      knowledgeBase,
      {
        conversationHistory: input.conversationHistory,
        userName: input.userName,
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
    console.log('\n✨ [Layer 1] Wrapping with personality...');
    
    const finalResponse = await wrapResponseWithPersonality(
      input.accountId,
      archetypeResult.response,
      classification.primaryArchetype,
      {
        userName: input.userName,
        conversationHistory: input.conversationHistory,
      }
    );

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
