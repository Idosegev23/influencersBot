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
import { buildPersonalityFromDB, type PersonalityConfig } from '../personality-wrapper';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model Configuration
const CHAT_MODEL = 'gpt-5.2-2025-12-11'; // ⚡ Newest and strongest model
const FALLBACK_MODEL = 'gpt-4o'; // ⚡ Reliable fallback
const MAX_TOKENS = 500; // Shorter responses for conversational flow

// ============================================
// Base Archetype Class
// ============================================

export abstract class BaseArchetype {
  protected definition: ArchetypeDefinition;

  constructor(definition: ArchetypeDefinition) {
    this.definition = definition;
  }

  /**
   * Replace [שם המשפיענית] placeholder with actual influencer name
   */
  private replaceName(text: string, name: string): string {
    return text.replace(/\[שם המשפיענית\]/g, name);
  }

  /**
   * Process user input and generate response
   */
  async process(input: ArchetypeInput): Promise<ArchetypeOutput> {
    // Extract influencer name early so it's available everywhere
    const influencerName = input.accountContext?.influencerName || 'המשפיענית';

    // 1. Check guardrails first
    const triggeredGuardrails = this.checkGuardrails(input.userMessage);
    
    // If critical guardrail triggered, block and return safety message
    const criticalGuardrail = triggeredGuardrails.find(g => g.severity === 'critical');
    if (criticalGuardrail) {
      const rule = this.definition.guardrails.find(r => r.id === criticalGuardrail.ruleId);
      const rawResponse = rule?.blockedResponse || 'מצטערת, אני לא יכולה לעזור בזה. כדאי להתייעץ עם מומחה.';
      
      return {
        response: this.replaceName(rawResponse, influencerName),
        triggeredGuardrails,
        knowledgeUsed: [],
        confidence: 1.0, // High confidence in safety block
      };
    }

    // 2. Build knowledge query with conversation context
    // Extract keywords from last 2 messages for context
    const historyKeywords = input.conversationHistory?.slice(-2)
      .map(m => m.content)
      .join(' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10)
      .join(' ') || '';

    const knowledgeQuery = this.definition.logic.buildKnowledgeQuery(
      `${input.userMessage} ${historyKeywords}`
    );

    // 3. Generate response using knowledge
    const response = await this.generateResponse(input, knowledgeQuery);

    // 4. Add warnings if needed
    let finalResponse = response;
    for (const triggered of triggeredGuardrails) {
      if (triggered.action === 'warn' && triggered.message) {
        finalResponse += '\n\n⚠️ ' + this.replaceName(triggered.message, influencerName);
      }
    }

    return {
      response: this.replaceName(finalResponse, influencerName),
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
          message: rule.action === 'warn' ? rule.warningMessage : (rule.blockedResponse || rule.warningMessage),
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
   * Build personality instructions for the system prompt
   * Replaces post-processing personality wrapper for streaming mode
   */
  private buildPersonalityPrompt(config: PersonalityConfig, name: string): string {
    const lines: string[] = [];

    // Narrative perspective
    if (config.narrativePerspective === 'direct') {
      lines.push('דבר/י בגוף ראשון (אני, שלי).');
    } else if (config.narrativePerspective === 'sidekick-professional') {
      lines.push(`דבר/י כעוזר/ת של ${name}. "היא" לעובדות, "אנחנו" להמלצות.`);
    } else if (config.narrativePerspective === 'sidekick-personal') {
      lines.push('דבר/י בגוף ראשון רבים (אנחנו ממליצות, אנחנו אומרות).');
    }

    // Emoji
    const emojiMap: Record<string, string> = {
      none: 'אל תשתמש/י באימוג\'ים.',
      minimal: 'אימוג\'י אחד לפעמים, לא יותר.',
      moderate: `2-3 אימוג'ים בתשובה. מועדפים: ${config.emojiTypes.slice(0, 4).join(' ')}`,
      heavy: `הרבה אימוג'ים! ${config.emojiTypes.slice(0, 6).join(' ')}`,
    };
    if (emojiMap[config.emojiUsage]) {
      lines.push(emojiMap[config.emojiUsage]);
    }

    // Common phrases
    if (config.commonPhrases.length > 0) {
      lines.push(`ביטויים אופייניים (השתמש/י לפעמים, באופן טבעי, לא בסוף כהוספה מאולצת): ${config.commonPhrases.slice(0, 4).join(', ')}`);
    }

    // Message structure
    if (config.messageStructure === 'whatsapp') {
      lines.push('פסקאות קצרות, כמו הודעת ווטסאפ.');
    }

    // Storytelling
    if (config.storytellingMode === 'concise') {
      lines.push('ענה/י בצורה תכליתית וקצרה.');
    } else if (config.storytellingMode === 'anecdotal') {
      lines.push('אפשר לשלב סיפורים וחוויות אישיות.');
    }

    return lines.filter(Boolean).join('\n');
  }

  /**
   * Generate AI response using GPT-5.2 with archetype-specific context
   * Supports real-time streaming via onToken callback
   */
  protected async generateAIResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<string> {
    const influencerName = input.accountContext.influencerName || 'המשפיענית';

    try {
      // Build context from knowledge base
      const kbContext = this.buildKnowledgeContext(input.knowledgeBase);
      
      // Build conversation history
      const historyMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = 
        input.conversationHistory?.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })) || [];

      // Load personality and build prompt instructions (replaces post-processing wrapper)
      let personalityBlock = '';
      if (input.onToken) {
        try {
          const personalityConfig = await buildPersonalityFromDB(input.accountContext.accountId);
          personalityBlock = `\n🎭 סגנון אישיות:\n${this.buildPersonalityPrompt(personalityConfig, influencerName)}`;
        } catch (e) {
          console.warn('[BaseArchetype] Failed to load personality, using defaults');
        }
      }
      
      // Build archetype-specific system prompt
      const systemPrompt = `אתה ${influencerName}, משפיענית שעוזרת לקהל שלה באופן אישי ומקצועי.

🎯 תפקיד: ${this.definition.name}
📝 ${this.definition.description}

${this.definition.logic.responseTemplates?.length ? '📋 איך לענות:\n' + this.definition.logic.responseTemplates.map(t => `• ${t.situation}: ${t.template}`).join('\n') : ''}
${personalityBlock}

⚠️ כללים קריטיים:
1. **תשובה קצרה וממוקדת**: 2-3 משפטים מקסימום. אל תסביר יותר מדי. תן תשובה תמציתית ותשאיר מקום לשאלות המשך.
2. **מידע ספציפי**: השתמש במידע מהתוכן שלי (סטוריז, פוסטים, הילייטס) - תן תוכן מלא!
3. **שפות**: הבן עברית ואנגלית (Spring = ספרינג, Renuar = רנואר)
4. **סגנון**: חם, אישי וידידותי - כמו שיחה עם חברה טובה
5. **אם אין מידע**: תגיד בכנות בניסוח חם כמו "לא נזכר לי שדיברתי על זה" או "אין לי מידע על זה ממש". **לעולם אל תשתמש בניסוחים טכניים כמו "בבסיס הידע"**.
6. **אל תציע דברים לא רלוונטיים**: אם שואלים על משהו ספציפי ואין לי אותו - אל תציע אלטרנטיבות אחרות!
7. לעולם אל תשתמש בסוגריים כמו [שם המשפיענית] - השתמש בשם האמיתי: ${influencerName}
8. אל תהיה גנרי ("זה פצצה") - דבר מניסיון אישי, אל תעתיק רשימות טכניות, נסח בצורה אישית ומקצועית
9. הקשר שיחה: התייחס להיסטוריית השיחה! אם השאלה הנוכחית מתייחסת לנושא שהועלה קודם (למשל "ספרת על הבוקר של הילדים"), התייחס לשאלה הקודמת ולתוכן שהוזכר.
10. **פורמט לינקים - CRITICAL**: 
    - כל לינק חייב להיות בפורמט: [טקסט](URL)
    - העתק את ה-URL בדיוק כמו שהוא מופיע במידע! אל תשנה, תוסיף או תמחק אותיות
    - אל תוסיף רווחים, מילים בעברית או סימנים מיוחדים בתוך ה-URL
    - דוגמה נכונה: [לחצי כאן](https://argania-cosmetics.com)
    - דוגמה שגויה: [לחצי כאן](https://www. מותק - argania-cosmetics.com)"
${process.env.MEMORY_V2_ENABLED === 'true' ? `
🔒 הנחיית דיוק:
- ענה **רק** על בסיס המידע שניתן לך (פוסטים, תמלולים, קופונים, שיתופי פעולה, היילייטס).
- אם אין לך מספיק מידע — אמור זאת בכנות ושאלי שאלה ממוקדת אחת.
- **אל תמציאי** מידע, מחירים, תאריכים או פרטים שלא הוזכרו במקורות.` : ''}`;

      const userPrompt = `${kbContext}

💬 שאלת המשתמש:
"${input.userMessage}"

תן תשובה קצרה, ספציפית ומועילה בעברית:`;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userPrompt },
      ];

      // === STREAMING MODE (when onToken callback is provided) ===
      if (input.onToken) {
        console.log('[BaseArchetype] Using STREAMING mode with onToken callback');
        try {
          const stream = await openai.chat.completions.create({
            model: CHAT_MODEL,
            messages,
            max_completion_tokens: MAX_TOKENS,
            stream: true,
          });

          let fullContent = '';
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              input.onToken(delta);
            }
          }

          if (fullContent) return this.replaceName(fullContent, influencerName);
          throw new Error('Empty streaming response from primary model');

        } catch (primaryError) {
          console.warn(`[BaseArchetype] Primary streaming model (${CHAT_MODEL}) failed, trying fallback:`, primaryError);
          
          const fallbackStream = await openai.chat.completions.create({
            model: FALLBACK_MODEL,
            messages,
            max_completion_tokens: MAX_TOKENS,
            stream: true,
          });

          let fullContent = '';
          for await (const chunk of fallbackStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              input.onToken(delta);
            }
          }

          if (fullContent) return this.replaceName(fullContent, influencerName);
          throw new Error('Empty streaming response from fallback model');
        }
      }

      // === BLOCKING MODE (backward compatible, no onToken) ===
      try {
        const response = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages,
          max_completion_tokens: MAX_TOKENS,
        });

        const content = response.choices[0].message.content;
        if (content) return this.replaceName(content, influencerName);
        throw new Error('Empty response from primary model');
        
      } catch (primaryError) {
        console.warn(`[BaseArchetype] Primary model (${CHAT_MODEL}) failed, trying fallback (${FALLBACK_MODEL}):`, primaryError);
        
        const fallbackResponse = await openai.chat.completions.create({
          model: FALLBACK_MODEL,
          messages,
          max_completion_tokens: MAX_TOKENS,
        });

        const content = fallbackResponse.choices[0].message.content;
        if (content) return this.replaceName(content, influencerName);
        throw new Error('Empty response from fallback model');
      }

    } catch (error) {
      console.error('[BaseArchetype] All models failed:', error);
      return `היי, אני קצת מתקשה למצוא את המידע המדויק כרגע. ${influencerName} בדרך כלל משתפת המון טיפים בנושא הזה! אולי תוכלי לחדד את השאלה?`;
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

    // Highlights - SHOW FULL CONTENT (including OCR!)
    if (kb.highlights?.length > 0) {
      context += `\n✨ **הילייטס וסטוריז (${kb.highlights.length}) - מידע אישי וחשוב (כולל טקסט מהתמונות!):**\n`;
      kb.highlights.slice(0, 15).forEach((h: any, i: number) => {
        context += `${i + 1}. "${h.title}"`;
        
        // Use the new content_text field which includes transcription + OCR
        if (h.content_text && h.content_text.trim().length > 0) {
          const truncated = h.content_text.length > 400 
            ? h.content_text.substring(0, 400) + '...' 
            : h.content_text;
          context += `\n   תוכן: ${truncated}`;
        }
        
        context += '\n';
      });
      context += '⚠️ **ההיילייטס כוללים טקסט שמופיע על התמונות (מתכונים, רשימות מוצרים, המלצות ספרים, וכו\')** - תן את המידע המלא!\n';
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
          context += ` | LINK: ${c.link}`;
        }
        context += '\n';
      });
      context += `
⚠️ CRITICAL INSTRUCTIONS FOR COUPONS:
1. שמות מותגים יכולים להיות באנגלית (Spring, Argania, Leaves, Renuar) או בעברית (ספרינג, ארגניה, ליבס, רנואר)
2. כשמישהו שואל על מותג - חפש גם באנגלית וגם בעברית!
3. דוגמאות: "ספרינג" = "Spring", "ארגניה" = "Argania", "ליבס" = "Leaves", "רנואר" = "Renuar"
4. תן את כל הקופונים הרלוונטיים למותג המבוקש + הקוד המלא
5. אם יש מספר קופונים למותג - תן את כולם!
6. **🚨 SUPER CRITICAL - אם אין קופון למותג המבוקש**:
   - אם שואלים על מותג ספציפי (לדוגמה "יש קופון לרנואר?") ו**אין** קופון למותג הזה ברשימה
   - תענה בכנות: "אין לי קופון לרנואר כרגע 🙏" 
   - **לעולם אל תציע קופונים של מותגים אחרים שלא קשורים לשאלה!**
   - **אל תהיה מסחרי ותדחוף קופונים לא רלוונטיים** - זה נראה desperate ולא אותנטי
   - רק אם שואלים "יש לך קופונים?" (שאלה כללית) - תן את כל הקופונים
7. **פורמט לינקים - CRITICAL**:
   - אם יש LINK במידע, תציג: [לחצי כאן](LINK)
   - העתק את ה-URL בדיוק כמו שהוא! אל תוסיף מילים, רווחים או טקסט עברי בתוך ה-URL
   - דוגמה נכונה: [לחצי כאן](https://argania-cosmetics.com)
   - דוגמה שגויה: [לחצי כאן](https://www. מותק - argania-cosmetics.com)\n`;
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
    
    // Transcriptions - SHOW VIDEO CONTENT (truncated for readability)
    if (kb.transcriptions?.length > 0) {
      context += `\n🎥 **תמלולים מסרטונים/רילים (${kb.transcriptions.length}) - זה תוכן חשוב (מתכונים, טיפים, אימונים):**\n`;
      kb.transcriptions.slice(0, 10).forEach((t: any, i: number) => {
        const truncated = t.text.length > 300 ? t.text.substring(0, 300) + '...' : t.text;
        context += `${i + 1}. ${truncated}\n\n`;
      });
      context += '⚠️ אם יש מתכון או טיפ בתמלולים - תן את כל המידע! אל תגיד "יש לי סרטון". נסח בצורה אישית, לא העתקה טכנית.\n';
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
