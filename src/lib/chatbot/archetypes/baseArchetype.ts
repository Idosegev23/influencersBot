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
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const GEMINI_MODEL = 'gemini-3-flash-preview'; // Fast, reliable model for chat responses

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
   * Generate AI response using Gemini with archetype-specific context
   */
  protected async generateAIResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      
      // Build context from knowledge base
      const kbContext = this.buildKnowledgeContext(input.knowledgeBase);
      
      // Build conversation history
      const historyContext = input.conversationHistory?.length 
        ? `\n📜 היסטוריית שיחה:\n${input.conversationHistory.map(m => `${m.role === 'user' ? 'משתמש' : 'אני'}: ${m.content}`).join('\n')}\n`
        : '';
      
      // Build archetype-specific prompt
      const prompt = `אתה עוזר וירטואלי של משפיענית/משפיען.

🎯 **תפקידך הנוכחי (Archetype):** ${this.definition.name}
📝 **תיאור:** ${this.definition.description}

${kbContext}
${historyContext}

💬 **הודעה מהמשתמש:**
${input.userMessage}

📋 **הנחיות תגובה:**
${this.definition.logic.responseTemplates?.map(t => `- ${t.situation}: ${t.template}`).join('\n') || '- ענה באופן טבעי ומועיל'}

⚠️ **חוקים חשובים:**
- דבר בגוף ראשון כנציג של המשפיענית
- היה חם, ידידותי ומועיל
- השתמש באימוג'ים במידה
- אם אין מידע רלוונטי - תגיד שתעדכן את המשפיענית לענות
- אל תמציא מידע שלא קיים בבסיס הידע

ענה בעברית, באופן טבעי וידידותי:`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text();
      
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
    
    let context = '📚 **בסיס הידע שלי:**\n';
    
    // Posts
    if (kb.posts?.length > 0) {
      context += `\n📸 **פוסטים (${kb.posts.length}):**\n`;
      kb.posts.slice(0, 5).forEach((p: any, i: number) => {
        context += `${i + 1}. ${p.caption?.substring(0, 150) || 'ללא כיתוב'}...\n`;
      });
    }
    
    // Coupons
    if (kb.coupons?.length > 0) {
      context += `\n💰 **קופונים (${kb.coupons.length}):**\n`;
      kb.coupons.forEach((c: any, i: number) => {
        context += `${i + 1}. **${c.code || c.brand}** - ${c.brand} (${c.discount || 'הנחה'})\n`;
        if (c.link) context += `   🔗 ${c.link}\n`;
      });
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
