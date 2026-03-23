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
import { supabase } from '@/lib/supabase';

// Fallback suggestions per archetype when LLM omits <<SUGGESTIONS>>
const ARCHETYPE_FALLBACK_SUGGESTIONS: Record<string, string> = {
  cooking: 'מתכון מהיר|טיפ למטבח|מה הכי שווה לנסות?',
  skincare: 'שגרת טיפוח|מוצר מומלץ|טיפ לעור',
  fashion: 'מה ללבוש?|טרנד חדש|המלצה לאאוטפיט',
  fitness: 'אימון מהיר|טיפ לכושר|תוכנית אימונים',
  coupons: 'קופונים פעילים|מבצע חדש|הנחה למותג',
  news: 'מה חם עכשיו?|חדשות סלבס|מה חדש בריאליטי?',
  general: 'ספרי לי עוד|יש קופון?|מה חדש?',
};

// Patterns that indicate "what's new?" intent for news accounts
const HOT_TOPIC_INTENT_PATTERNS = /מה חדש|מה קורה|חדשות|מה הטרנד|מה חם|טרנד|מה קרה|עדכונים|מה היה היום|ספרו לי/;

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
  chunkId?: string; // Direct chunk ID from content feed — skip RAG search, inject chunk directly
  // Pre-fetched RAG results (from suggestion cache — skips RAG retrieval, LLM runs fresh)
  cachedKnowledgeBase?: KnowledgeBase;
  cachedArchetype?: string;
  cachedConfidence?: number;
  // Proactive conversation enrichment (from understanding engine + stream/route)
  suggestedClarifications?: string[]; // Questions to ask when intent is ambiguous
  activeCoupons?: Array<{ brand_name: string; coupon_code: string; description?: string }>; // Available coupons for proactive mention
  conversationTopics?: string[]; // Topics from rolling_summary for deepening
}

export interface SandwichBotOutput {
  response: string;
  responseId?: string | null; // OpenAI Responses API response ID for context chaining
  metadata: {
    archetype: string;
    confidence: number;
    guardrailsTriggered: any[];
    personalityApplied: boolean;
    knowledgeBase?: KnowledgeBase; // Exposed for RAG caching on suggestion clicks
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
    // LAYER 2: Route to Archetype (skip if cached)
    // ==========================================
    let classification: { primaryArchetype: string; confidence: number };

    if (input.cachedArchetype) {
      // Use pre-cached archetype from RAG cache (suggestion click)
      classification = {
        primaryArchetype: input.cachedArchetype,
        confidence: input.cachedConfidence ?? 0.8,
      };
      console.log(`\n📍 [Layer 2] Using cached archetype: ${classification.primaryArchetype} (${(classification.confidence * 100).toFixed(0)}%)`);
    } else {
      console.log('\n📍 [Layer 2] Routing to archetype...');
      classification = await routeToArchetype({
        userMessage: input.userMessage,
        conversationHistory: input.conversationHistory,
        accountContext: {
          accountId: input.accountId,
          username: input.username,
        },
      });
      console.log(`   → Archetype: ${classification.primaryArchetype}`);
      console.log(`   → Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
    }

    // ==========================================
    // Retrieve Knowledge Base (skip if cached)
    // ==========================================
    let knowledgeBase: KnowledgeBase;

    if (input.cachedKnowledgeBase) {
      // Use pre-cached RAG results (suggestion click — LLM still runs fresh)
      knowledgeBase = input.cachedKnowledgeBase;
      console.log(`\n📚 Using cached RAG results (posts: ${knowledgeBase.posts.length}, coupons: ${knowledgeBase.coupons.length})`);
    } else {
      console.log('\n📚 Retrieving knowledge...');

      // Enrich query with conversation context for follow-up messages
      let knowledgeQuery = input.userMessage;

      const shouldEnrich = input.userMessage.length < 80;
      if (shouldEnrich) {
        const contextParts: string[] = [];

        if (input.mode === 'dm') {
          const recentUserMsgs = (input.conversationHistory || [])
            .filter(m => m.role === 'user')
            .slice(-3);
          for (const msg of recentUserMsgs) {
            contextParts.push(msg.content.substring(0, 150));
          }
          if (input.rollingSummary) {
            contextParts.push(input.rollingSummary.substring(0, 200));
          }
        } else {
          if (input.rollingSummary) {
            contextParts.push(input.rollingSummary.substring(0, 200));
          }
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

      knowledgeBase = await this.retrieveKnowledge(
        input.accountId,
        classification.primaryArchetype as any,
        knowledgeQuery,
        input.rollingSummary
      );
    }

    // If media_news account and "what's new?" intent, inject hot topics
    if (HOT_TOPIC_INTENT_PATTERNS.test(input.userMessage)) {
      try {
        const { data: account } = await supabase
          .from('accounts')
          .select('config')
          .eq('id', input.accountId)
          .single();

        if ((account?.config as any)?.archetype === 'media_news') {
          const { getTopHotTopics } = await import('@/lib/hot-topics/query');
          const hotTopics = await getTopHotTopics(5, ['breaking', 'hot']);

          if (hotTopics.length > 0) {
            console.log(`   🔥 Injecting ${hotTopics.length} hot topics for media_news account`);
            const hotTopicsText = hotTopics
              .map((t, i) => {
                const statusLabel = t.status === 'breaking' ? '[בריקינג]' : '[חם]';
                return `${i + 1}. ${statusLabel} ${t.topic_name}: ${t.summary || 'נושא חם'}  (${t.coverage_count} ערוצים כיסו, ${t.total_posts} פוסטים)`;
              })
              .join('\n');

            // Inject as a post so it appears in the knowledge context
            knowledgeBase.posts = [
              {
                shortcode: 'hot-topics',
                caption: `🔥 נושאים חמים עכשיו:\n${hotTopicsText}`,
                media_url: '',
                timestamp: new Date().toISOString(),
              } as any,
              ...knowledgeBase.posts,
            ];
          }
        }
      } catch (err) {
        console.error('[SandwichBot] Failed to inject hot topics:', err);
      }
    }

    // If chunkId provided (from content feed), inject that chunk directly into knowledge
    if (input.chunkId) {
      try {
        const { data: chunk } = await supabase
          .from('document_chunks')
          .select('chunk_text, entity_type, metadata')
          .eq('id', input.chunkId)
          .single();

        if (chunk?.chunk_text) {
          console.log(`   📌 Injecting content-feed chunk ${input.chunkId} (${chunk.chunk_text.length} chars)`);
          // Inject as a website/post entry so the archetype prompt includes it
          if (chunk.entity_type === 'website') {
            knowledgeBase.websites = [
              { url: chunk.metadata?.source_url || '', content: chunk.chunk_text, title: chunk.metadata?.title || '', scraped_at: '' },
              ...knowledgeBase.websites,
            ];
          } else {
            // Post or transcription — inject as a post
            knowledgeBase.posts = [
              { shortcode: chunk.metadata?.shortcode || '', caption: chunk.chunk_text, media_url: '', timestamp: '' } as any,
              ...knowledgeBase.posts,
            ];
          }
        }
      } catch (err) {
        console.error('[SandwichBot] Failed to fetch chunk:', err);
      }
    }

    // ==========================================
    // LAYER 2 + 3: Process with Archetype (includes Guardrails)
    // ==========================================
    console.log('\n🎯 [Layer 2+3] Processing with archetype + guardrails...');
    console.log(`   ⚡ Streaming mode: ${input.onToken ? 'YES' : 'NO'}`);
    
    const archetypeResult = await processWithArchetype(
      classification.primaryArchetype as any,
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
        suggestedClarifications: input.suggestedClarifications,
        activeCoupons: input.activeCoupons,
        conversationTopics: input.conversationTopics,
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
        // Expose knowledgeBase for RAG caching (only when freshly retrieved, not from cache)
        knowledgeBase: input.cachedKnowledgeBase ? undefined : knowledgeBase,
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
