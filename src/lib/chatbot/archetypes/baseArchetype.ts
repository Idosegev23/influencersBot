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
      const prompt = `אתה עוזר וירטואלי חכם של משפיענית שעוזר לקהל שלה באופן אישי ומקצועי.

🎯 תפקיד: ${this.definition.name}
📝 ${this.definition.description}

${kbContext}
${historyContext}

💬 שאלת המשתמש:
"${input.userMessage}"

${this.definition.logic.responseTemplates?.length ? '📋 איך לענות:\n' + this.definition.logic.responseTemplates.map(t => `• ${t.situation}: ${t.template}`).join('\n') : ''}

⚠️ כללים קריטיים (MUST FOLLOW):

1. תשובה קצרה וממוקדת:
   • מקסימום 3-4 משפטים קצרים
   • ישר לעניין, בלי הקדמות ארוכות
   • אל תדבר בכלליות!

2. השתמש במידע ספציפי מבסיס הידע - תן תוכן מלא!
   • אם יש קופונים/מותגים - תן שמות מדויקים + אחוזי הנחה + קודים
   • אם יש מתכונים/טיפים בפוסטים/תמלולים - תן את המידע המלא, אל תגיד "יש לי פוסט"
   • דוגמה טובה למתכון: "המרכיבים: 2 כוסות קמח, 1 כף שמן... שלבים: ..."
   • דוגמה רעה: "יש לי פוסט עם מתכון" (אסור!)
   • אם שואלים על מתכון/טיפ - תן את התוכן המלא מהפוסט או מהתמלול

3. שפות ושמות מותגים - CRITICAL:
   • משתמשים יכולים לשאול באנגלית או בעברית
   • שמות מותגים יכולים להיות באנגלית (Spring, Argania) או בעברית (ספרינג, ארגניה)
   • תבין שאלות בשתי השפות! "יש קופון לספרינג?" = "יש קופון ל-Spring?"
   • אל תגיד "אין מידע" אם המידע קיים בשפה אחרת!

4. סגנון תקשורת:
   • חם וידידותי אבל לא מוגזם
   • 1-2 אימוג'ים מקסימום
   • גוף ראשון רבים: "אנחנו ממליצות", "יש לנו"
   • אל תתחיל עם "היי אהובה!" או דברים דומים

5. אם אין מידע רלוונטי - CRITICAL:
   • תגיד בכנות: "אין לי כרגע מידע על זה, אני מעדכנת את המשפיענית"
   • אל תמציא מידע!
   • אל תציע קופונים/מוצרים לא רלוונטיים!
   • אם המשפיענית לא מומחית בנושא - תגיד את זה בכנות
   • דוגמה טובה: "מירן מתמחה בעיקר באימוני כוח, לא ביוגה"
   • דוגמה רעה: "אין מידע על יוגה, אבל יש קופון ל-Leaves!" (אסור!)

6. אל תנסה להיות "מועיל מדי":
   • אם השאלה על יוגה ואין תוכן - תגיד שאין תוכן
   • אל תשנה נושא לקופונים/מתכונים לא רלוונטיים
   • תשובה כנה עדיפה על תשובה מבולבלת!

תן תשובה קצרה, ספציפית ומועילה בעברית:`;

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
