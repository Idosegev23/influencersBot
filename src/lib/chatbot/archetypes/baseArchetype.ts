/**
 * Base Archetype
 * מחלקת בסיס לכל הארכיטיפים
 */

import { 
  ArchetypeDefinition, 
  ArchetypeInput, 
  ArchetypeOutput, 
  GuardrailRule 
} from './types';
import OpenAI from 'openai';

// Initialize OpenAI with GPT-5 Nano - FASTEST!
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const CHAT_MODEL = 'gpt-5-nano-2025-08-07'; // ⚡ Fastest, most cost-efficient for chat (specific snapshot)

// ============================================
// Base Archetype Class
// ============================================

export abstract class BaseArchetype {
  protected definition: ArchetypeDefinition;

  constructor(definition: ArchetypeDefinition) {
    this.definition = definition;
  }

  /**
   * Process user input and generate response
   */
  async process(input: ArchetypeInput): Promise<ArchetypeOutput> {
    // 1. Check guardrails first
    const triggeredGuardrails = this.checkGuardrails(input.userMessage);
    
    // If critical guardrail triggered, block and return safety message
    const criticalGuardrail = triggeredGuardrails.find(g => g.severity === 'critical');
    if (criticalGuardrail) {
      const rule = this.definition.guardrails.find(r => r.id === criticalGuardrail.ruleId);
      
      return {
        response: rule?.blockedResponse || 'מצטערת, אני לא יכולה לעזור בזה. כדאי להתייעץ עם מומחה.',
        triggeredGuardrails,
        knowledgeUsed: [],
        confidence: 1.0, // High confidence in safety block
      };
    }

    // 2. Build knowledge query
    const knowledgeQuery = this.definition.logic.buildKnowledgeQuery(input.userMessage);

    // 3. Generate response using knowledge
    const response = await this.generateResponse(input, knowledgeQuery);

    // 4. Add warnings if needed
    let finalResponse = response;
    for (const triggered of triggeredGuardrails) {
      if (triggered.action === 'warn' && triggered.message) {
        finalResponse += '\n\n⚠️ ' + triggered.message;
      }
    }

    return {
      response: finalResponse,
      triggeredGuardrails,
      knowledgeUsed: [knowledgeQuery],
      confidence: this.calculateConfidence(input, response),
    };
  }

  /**
   * Check all guardrails for this archetype
   */
  private checkGuardrails(userMessage: string): Array<{
    ruleId: string;
    severity: string;
    action: string;
    message?: string;
  }> {
    const triggered = [];
    const lowerMessage = userMessage.toLowerCase();

    for (const rule of this.definition.guardrails) {
      let isTriggered = false;

      // Check keywords
      if (rule.triggers.keywords) {
        for (const keyword of rule.triggers.keywords) {
          if (lowerMessage.includes(keyword.toLowerCase())) {
            isTriggered = true;
            break;
          }
        }
      }

      // Check patterns
      if (!isTriggered && rule.triggers.patterns) {
        for (const pattern of rule.triggers.patterns) {
          if (pattern.test(userMessage)) {
            isTriggered = true;
            break;
          }
        }
      }

      if (isTriggered) {
        triggered.push({
          ruleId: rule.id,
          severity: rule.severity,
          action: rule.action,
          message: rule.action === 'warn' ? rule.warningMessage : rule.blockedResponse,
        });
      }
    }

    return triggered;
  }

  /**
   * Generate response using Gemini AI
   * Can be overridden by subclasses for custom logic
   */
  protected async generateResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<string> {
    return this.generateAIResponse(input, knowledgeQuery);
  }

  /**
   * Generate AI response using GPT-5 Nano with archetype-specific context
   */
  protected async generateAIResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<string> {
    try {
      // Build context from knowledge base
      const kbContext = this.buildKnowledgeContext(input.knowledgeBase);
      
      // Build conversation history
      const historyMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = 
        input.conversationHistory?.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })) || [];
      
      // Build archetype-specific system prompt
      const systemPrompt = `אתה עוזר וירטואלי חכם של משפיענית שעוזר לקהל שלה באופן אישי ומקצועי.

🎯 תפקיד: ${this.definition.name}
📝 ${this.definition.description}

${this.definition.logic.responseTemplates?.length ? '📋 איך לענות:\n' + this.definition.logic.responseTemplates.map(t => `• ${t.situation}: ${t.template}`).join('\n') : ''}

⚠️ כללים קריטיים:
1. תשובה קצרה (3-4 משפטים)
2. השתמש במידע ספציפי מבסיס הידע - תן תוכן מלא!
3. שפות: הבן עברית ואנגלית (Spring = ספרינג)
4. סגנון: חם וידידותי, 1-2 אימוג'ים
5. אם אין מידע - תגיד בכנות
6. אל תציע דברים לא רלוונטיים!`;

      const userPrompt = `${kbContext}

💬 שאלת המשתמש:
"${input.userMessage}"

תן תשובה קצרה, ספציפית ומועילה בעברית:`;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userPrompt },
      ];

      const response = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        // GPT-5 Nano only supports temperature: 1 (default), so we omit it
        max_completion_tokens: 500, // Short responses (GPT-5 Nano uses max_completion_tokens)
      });

      return response.choices[0].message.content || this.definition.logic.defaultResponse;
      
    } catch (error) {
      console.error('[BaseArchetype] AI generation error:', error);
      // Fallback to default response
      return this.definition.logic.defaultResponse;
    }
  }

  /**
   * Build knowledge context string from knowledge base
   */
  private buildKnowledgeContext(kb: any): string {
    if (!kb) return '📚 **בסיס ידע:** אין מידע זמין כרגע.';
    
    let context = '📚 **בסיס הידע שלי (השתמש בתוכן המלא, לא להפנות!):**\n';
    
    // Posts - SHOW FULL CONTENT
    if (kb.posts?.length > 0) {
      context += `\n📸 **תוכן מפוסטים (${kb.posts.length}) - תן את המידע המלא מכאן:**\n`;
      kb.posts.slice(0, 5).forEach((p: any, i: number) => {
        const caption = p.caption || 'ללא כיתוב';
        // Show full caption, not just 150 chars
        context += `${i + 1}. ${caption}\n`;
        if (p.hashtags?.length > 0) {
          context += `   תגיות: ${p.hashtags.slice(0, 5).join(' ')}\n`;
        }
        context += '\n';
      });
    }
    
    // Coupons - PRIORITIZE THIS!
    if (kb.coupons?.length > 0) {
      context += `\n💰 **קופונים זמינים (${kb.coupons.length}) - CRITICAL: שמות המותגים יכולים להיות באנגלית או בעברית:**\n`;
      kb.coupons.forEach((c: any, i: number) => {
        context += `${i + 1}. מותג: ${c.brand || c.code}`;
        if (c.discount && !c.discount.includes('לחץ על הקישור')) {
          context += ` | הנחה: ${c.discount}`;
        }
        if (c.code) {
          context += ` | קוד: ${c.code}`;
        }
        if (c.link) {
          context += ` | 🔗 ${c.link}`;
        }
        context += '\n';
      });
      context += `
⚠️ CRITICAL INSTRUCTIONS FOR COUPONS:
1. שמות מותגים יכולים להיות באנגלית (Spring, Argania, Leaves) או בעברית (ספרינג, ארגניה, ליבס)
2. כשמישהו שואל על מותג - חפש גם באנגלית וגם בעברית!
3. דוגמאות: "ספרינג" = "Spring", "ארגניה" = "Argania", "ליבס" = "Leaves"
4. תן את כל הקופונים הרלוונטיים למותג + הקוד המלא + הלינק
5. אם יש מספר קופונים למותג - תן את כולם!\n`;
    }
    
    // Partnerships/Brands
    if (kb.partnerships?.length > 0) {
      context += `\n🤝 **שיתופי פעולה ומותגים (${kb.partnerships.length}):**\n`;
      kb.partnerships.slice(0, 10).forEach((p: any, i: number) => {
        context += `${i + 1}. ${p.brandName || p.brand_name}`;
        if (p.brief) context += ` - ${p.brief.substring(0, 100)}`;
        context += '\n';
      });
    }
    
    // Insights
    if (kb.insights?.length > 0) {
      context += `\n💡 **תובנות (${kb.insights.length}):**\n`;
      kb.insights.slice(0, 3).forEach((ins: any, i: number) => {
        context += `${i + 1}. ${ins.insight || ins.content}\n`;
      });
    }
    
    // Transcriptions - SHOW FULL VIDEO CONTENT
    if (kb.transcriptions?.length > 0) {
      context += `\n🎥 **תמלולים מסרטונים/רילים (${kb.transcriptions.length}) - זה תוכן חשוב (מתכונים, טיפים, אימונים):**\n`;
      kb.transcriptions.slice(0, 10).forEach((t: any, i: number) => {
        context += `${i + 1}. ${t.text}\n\n`;
      });
      context += '⚠️ אם יש מתכון או טיפ בתמלולים - תן את כל המידע! אל תגיד "יש לי סרטון"\n';
    }
    
    // Websites/Linkis
    if (kb.websites?.length > 0) {
      context += `\n🌐 **אתרים וקישורים (${kb.websites.length}):**\n`;
      kb.websites.forEach((w: any, i: number) => {
        context += `${i + 1}. ${w.title || w.url}\n`;
        if (w.content) context += `   ${w.content.substring(0, 200)}...\n`;
      });
    }
    
    return context;
  }

  /**
   * Calculate confidence in the response
   */
  protected calculateConfidence(input: ArchetypeInput, response: string): number {
    // Base confidence based on knowledge availability
    let confidence = input.knowledgeBase ? 0.8 : 0.5;

    // Increase if we have specific data
    if (response.includes('המלצה') || response.includes('מוצר')) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get archetype type
   */
  getType(): string {
    return this.definition.type;
  }

  /**
   * Get archetype name
   */
  getName(): string {
    return this.definition.name;
  }

  /**
   * Check if this archetype can handle the message
   */
  canHandle(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check keywords
    for (const keyword of this.definition.triggers.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    // Check patterns
    if (this.definition.triggers.patterns) {
      for (const pattern of this.definition.triggers.patterns) {
        if (pattern.test(message)) {
          return true;
        }
      }
    }

    return false;
  }
}
