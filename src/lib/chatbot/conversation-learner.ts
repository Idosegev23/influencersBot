/**
 * Conversation Learner
 * מנגנון למידה מהשיחות - מזהה תובנות ומשפר את הבוט
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================
// Type Definitions
// ============================================

export interface ConversationInsight {
  type: string;
  title: string;
  content: string;
  examples: string[];
  confidence: number;
  archetype?: string;
}

export interface AnalysisResult {
  insightsCreated: number;
  insightsUpdated: number;
  conversationsAnalyzed: number;
  messagesAnalyzed: number;
}

// ============================================
// Conversation Learner Class
// ============================================

export class ConversationLearner {
  private supabase: any;

  async init() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
  }

  /**
   * Analyze recent conversations and extract insights
   */
  async analyzeRecentConversations(
    accountId: string,
    options: {
      hoursBack?: number;
      minConversations?: number;
      batchSize?: number;
    } = {}
  ): Promise<AnalysisResult> {
    await this.init();

    const hoursBack = options.hoursBack || 24;
    const minConversations = options.minConversations || 5;
    const batchSize = options.batchSize || 50;

    const result: AnalysisResult = {
      insightsCreated: 0,
      insightsUpdated: 0,
      conversationsAnalyzed: 0,
      messagesAnalyzed: 0,
    };

    // Create analysis run record
    const analyzedFrom = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const analyzedTo = new Date().toISOString();

    const { data: analysisRun, error: runError } = await this.supabase
      .from('conversation_analysis_runs')
      .insert({
        account_id: accountId,
        analyzed_from: analyzedFrom,
        analyzed_to: analyzedTo,
        status: 'running',
      })
      .select()
      .single();

    if (runError) {
      throw new Error(`Failed to create analysis run: ${runError.message}`);
    }

    try {
      // Fetch recent conversations
      const { data: conversations } = await this.supabase
        .from('chatbot_conversations_v2')
        .select(`
          id,
          user_identifier,
          created_at,
          chatbot_messages_v2 (
            role,
            content,
            created_at
          )
        `)
        .eq('account_id', accountId)
        .gte('created_at', analyzedFrom)
        .lte('created_at', analyzedTo)
        .order('created_at', { ascending: false });

      if (!conversations || conversations.length < minConversations) {
        console.log(`[ConversationLearner] Not enough conversations (${conversations?.length || 0}/${minConversations})`);
        
        await this.supabase
          .from('conversation_analysis_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            conversations_analyzed: conversations?.length || 0,
          })
          .eq('id', analysisRun.id);

        return result;
      }

      // Batch conversations and analyze
      for (let i = 0; i < conversations.length; i += batchSize) {
        const batch = conversations.slice(i, i + batchSize);
        
        const insights = await this.extractInsights(batch);
        
        // Save insights
        for (const insight of insights) {
          const saved = await this.saveInsight(accountId, insight);
          if (saved.created) {
            result.insightsCreated++;
          } else {
            result.insightsUpdated++;
          }
        }

        result.conversationsAnalyzed += batch.length;
        result.messagesAnalyzed += batch.reduce((sum, c) => sum + (c.chatbot_messages_v2?.length || 0), 0);
      }

      // Update analysis run
      await this.supabase
        .from('conversation_analysis_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          conversations_analyzed: result.conversationsAnalyzed,
          messages_analyzed: result.messagesAnalyzed,
          insights_created: result.insightsCreated,
          insights_updated: result.insightsUpdated,
        })
        .eq('id', analysisRun.id);

    } catch (error: any) {
      // Mark run as failed
      await this.supabase
        .from('conversation_analysis_runs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', analysisRun.id);

      throw error;
    }

    return result;
  }

  /**
   * Extract insights from conversations using Gemini
   */
  private async extractInsights(conversations: any[]): Promise<ConversationInsight[]> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // Build conversation text
    let conversationText = '';
    for (const conv of conversations) {
      conversationText += `--- שיחה ${conv.id} ---\n`;
      for (const msg of conv.chatbot_messages_v2 || []) {
        conversationText += `${msg.role}: ${msg.content}\n`;
      }
      conversationText += '\n';
    }

    const prompt = `אתה מנתח שיחות של בוט צ'אט של משפיענית.
המטרה: לזהות תובנות שיעזרו לבוט להשתפר.

נתח את השיחות הבאות וזהה:

1. **שאלות נפוצות (FAQ)** - שאלות שחוזרות על עצמן
   - מה השאלה?
   - מה התשובה הטובה ביותר?

2. **נושאים מעניינים** - על מה הקהל שואל הכי הרבה?
   - קופונים והנחות
   - שיתופי פעולה
   - טיפים ועצות
   - מוצרים ספציפיים

3. **בעיות/Pain Points** - עם מה הקהל מתמודד?
   - מה הבעיה?
   - איך אפשר לעזור?

4. **פידבק** - מה אומרים על המשפיענית/מוצרים?
   - פידבק חיובי
   - פידבק שלילי
   - הצעות לשיפור

5. **התנגדויות** - מה עוצר אנשים?
   - מחיר
   - ספקות
   - שאלות נוספות

6. **דפוסי שפה** - איך הקהל מדבר?
   - מילים נפוצות
   - סגנון (פורמלי/לא פורמלי)
   - אמוג'ים נפוצים

שיחות:
${conversationText.substring(0, 10000)}

החזר JSON בפורמט:
{
  "insights": [
    {
      "type": "faq|topic_interest|pain_point|feedback|objection|language_pattern",
      "title": "כותרת קצרה",
      "content": "תיאור מפורט",
      "examples": ["דוגמה 1", "דוגמה 2"],
      "confidence": 0.0-1.0,
      "archetype": "skincare|fashion|cooking|etc"
    }
  ]
}`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response.text();

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ConversationLearner] Failed to parse Gemini response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.insights || [];

    } catch (error) {
      console.error('[ConversationLearner] Failed to extract insights:', error);
      return [];
    }
  }

  /**
   * Save insight to database (or update existing)
   */
  private async saveInsight(
    accountId: string,
    insight: ConversationInsight
  ): Promise<{ created: boolean; id: string }> {
    // Try to find similar existing insight
    const { data: existing } = await this.supabase
      .from('conversation_insights')
      .select('id, occurrence_count, examples')
      .eq('account_id', accountId)
      .eq('insight_type', insight.type)
      .eq('is_active', true)
      .ilike('title', `%${insight.title}%`)
      .single();

    if (existing) {
      // Update existing insight
      const newExamples = [...(existing.examples || []), ...insight.examples].slice(0, 10);
      
      await this.supabase
        .from('conversation_insights')
        .update({
          occurrence_count: existing.occurrence_count + 1,
          examples: newExamples,
          confidence_score: Math.min((existing.occurrence_count + 1) * 0.1, 1.0),
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      return { created: false, id: existing.id };
    } else {
      // Create new insight
      const { data: newInsight } = await this.supabase
        .from('conversation_insights')
        .insert({
          account_id: accountId,
          insight_type: insight.type,
          title: insight.title,
          content: insight.content,
          examples: insight.examples,
          confidence_score: insight.confidence,
          archetype: insight.archetype,
        })
        .select()
        .single();

      return { created: true, id: newInsight.id };
    }
  }

  /**
   * Get top insights for account
   */
  async getTopInsights(
    accountId: string,
    type?: string,
    limit: number = 10
  ): Promise<any[]> {
    await this.init();

    const { data, error } = await this.supabase
      .rpc('get_top_insights', {
        p_account_id: accountId,
        p_insight_type: type || null,
        p_limit: limit,
      });

    if (error) {
      console.error('[ConversationLearner] Failed to get insights:', error);
      return [];
    }

    return data || [];
  }
}

// ============================================
// Singleton & Convenience Functions
// ============================================

let learnerInstance: ConversationLearner | null = null;

export function getConversationLearner(): ConversationLearner {
  if (!learnerInstance) {
    learnerInstance = new ConversationLearner();
  }
  return learnerInstance;
}

/**
 * Analyze conversations for an account
 */
export async function analyzeConversations(
  accountId: string,
  hoursBack: number = 24
): Promise<AnalysisResult> {
  const learner = getConversationLearner();
  return learner.analyzeRecentConversations(accountId, { hoursBack });
}

/**
 * Get insights for building persona
 */
export async function getInsightsForPersona(accountId: string) {
  const learner = getConversationLearner();
  
  const [faqs, topics, painPoints, language] = await Promise.all([
    learner.getTopInsights(accountId, 'faq', 5),
    learner.getTopInsights(accountId, 'topic_interest', 5),
    learner.getTopInsights(accountId, 'pain_point', 5),
    learner.getTopInsights(accountId, 'language_pattern', 3),
  ]);

  return {
    frequentQuestions: faqs,
    hotTopics: topics,
    painPoints,
    audienceLanguage: language,
  };
}
