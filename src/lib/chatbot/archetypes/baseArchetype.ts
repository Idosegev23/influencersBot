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
import { getGeminiClient, MODELS } from '@/lib/ai/google-client';
import { buildPersonalityFromDB, type PersonalityConfig } from '../personality-wrapper';
import { compactKnowledgeContext } from '@/lib/rag/compact-knowledge-context';

const MAX_TOKENS = 1024;

// Map decision engine model tiers to Gemini models
function resolveModel(tier?: 'nano' | 'standard' | 'full'): { primary: string; fallback: string } {
  switch (tier) {
    case 'nano':
      return { primary: MODELS.CHAT_LITE, fallback: MODELS.CHAT_FAST };
    case 'full':
    case 'standard':
    default:
      return { primary: MODELS.CHAT_FAST, fallback: MODELS.CHAT_LITE };
  }
}

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

    // 2. Detect topic change and manage context accordingly
    const lastAssistant = input.conversationHistory
      ?.filter(m => m.role === 'assistant')
      .slice(-1)[0]?.content || '';

    const topicChanged = lastAssistant
      ? this.isTopicChange(input.userMessage, lastAssistant)
      : false;

    // If topic changed: don't pollute KB query AND trim history so GPT
    // doesn't bleed old topics into the new answer.
    let historyKeywords = '';
    if (!topicChanged && lastAssistant) {
      historyKeywords = input.conversationHistory?.slice(-2)
        .map(m => m.content)
        .join(' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 10)
        .join(' ') || '';
    }

    // Note: history trimming is no longer needed here — the Responses API
    // handles context via previous_response_id chain, which is broken on topic change.

    const knowledgeQuery = this.definition.logic.buildKnowledgeQuery(
      historyKeywords ? `${input.userMessage} ${historyKeywords}` : input.userMessage
    );

    // 3. Generate response using knowledge
    const response = await this.generateResponse(input, knowledgeQuery);

    // 4. Add warnings if needed
    let finalResponse = response.text;
    for (const triggered of triggeredGuardrails) {
      if (triggered.action === 'warn' && triggered.message) {
        finalResponse += '\n\n⚠️ ' + this.replaceName(triggered.message, influencerName);
      }
    }

    return {
      response: this.replaceName(finalResponse, influencerName),
      responseId: response.responseId,
      triggeredGuardrails,
      knowledgeUsed: [knowledgeQuery],
      confidence: this.calculateConfidence(input, response.text),
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
   * Generate response using OpenAI Responses API
   * Can be overridden by subclasses for custom logic
   */
  protected async generateResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<{ text: string; responseId?: string | null }> {
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
      lines.push(`ביטויים אופייניים (פעם ב-3-4 הודעות, לא בכל הודעה! אל תפתח/י עם כינויי חיבה כל פעם): ${config.commonPhrases.slice(0, 4).join(', ')}`);
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
   * Generate AI response using Google Gemini.
   * Supports real-time streaming via onToken callback.
   */
  protected async generateAIResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<{ text: string; responseId?: string | null }> {
    const influencerName = input.accountContext.influencerName || 'המשפיענית';

    try {
      // Build context from knowledge base
      const kbContext = this.buildKnowledgeContext(input.knowledgeBase);

      // Build personality prompt (use pre-loaded config if available, else load from DB)
      let personalityBlock = '';
      if (input.onToken) {
        try {
          const personalityConfig = input.personalityConfig || await buildPersonalityFromDB(input.accountContext.accountId);
          personalityBlock = `\n🎭 סגנון אישיות:\n${this.buildPersonalityPrompt(personalityConfig, influencerName)}`;
        } catch (e) {
          console.warn('[BaseArchetype] Failed to load personality, using defaults');
        }
      }

      // Build archetype-specific instructions (replaces system prompt)
      const instructions = `אתה ${influencerName}, משפיענית שמנהלת שיחה טבעית עם הקהל שלה — כמו חברה, לא כמו מכונת חיפוש.
⚠️ **אל תפתח/י כל הודעה עם כינויי חיבה** ("מאמי", "אהובה", "יקירה"). תפתח/י ישר לעניין. כינוי חיבה מותר לפעמים, לא בכל הודעה.

📜 הקשר שיחה: **תמיד** תבין/י הפניות להיסטוריה ("המתכון", "מה שאמרת", "זה"). השיחה זורמת — אל תתנהג/י כאילו כל הודעה מתחילה מאפס.

🔀 **זיהוי מעבר נושא — קריטי!**
כשהמשתמש/ת שואל/ת על נושא חדש שלא קשור לשאלה הקודמת:
• ענה/י **רק** על הנושא החדש. **אל תערבב** מידע מנושאים קודמים.
• אל תזכיר/י מוצרים, מתכונים, או טיפים מתשובות קודמות אלא אם המשתמש/ת ביקש/ה במפורש.
• אם אין לך מידע על הנושא החדש — אמור/י בכנות במקום להציע משהו לא קשור מנושא ישן.

🎯 תפקיד: ${this.definition.name}
📝 ${this.definition.description}

${this.definition.logic.responseTemplates?.length ? '📋 איך לענות:\n' + this.definition.logic.responseTemplates.map(t => `• ${t.situation}: ${t.template}`).join('\n') : ''}
${personalityBlock}

💬 סגנון שיחה — פרסונלי ומכוון:
• **שאלות רחבות** ("יש לך מתכון לפסטה?"): רמוז/י שיש לך כמה אפשרויות ותשאל/י שאלה מכוונת — "שמנת או עגבניות? משהו מהיר ליומיום או לאירוח?" — כדי לתת בדיוק מה שצריך.
• **שאלות ספציפיות** ("מה המתכון לרביולי בטטה?"): תן/י תשובה מלאה ומפורטת ישר — אל תשאל/י שאלות מיותרות.
• **תשובות לשאלה שלך** (המשתמש ענה "שמנת" / "לאירוח"): תן/י את התשובה המלאה בהתאם לבחירה, בלי עוד שאלות.
• **אחרי כל תשובה**: הציע/י בקצרה המשך טבעי אחד בתוך הטקסט.
• 1-2 אימוג'ים מקסימום לכל תשובה.

📌 המלצות המשך:
בסוף **כל** תשובה, הוסף שורה אחרונה בפורמט הזה בדיוק:
<<SUGGESTIONS>>הצעה 1|הצעה 2|הצעה 3<</SUGGESTIONS>>
• 2-3 הצעות קצרות (עד 6 מילים כל אחת) שקשורות **ישירות** למה שדיברנו עליו.
• דוגמאות: <<SUGGESTIONS>>תני טיפ להגשה|יש גרסה בלי גלוטן?|עוד מתכון פסטה<</SUGGESTIONS>>
• ⚠️ זה חייב להיות בשורה האחרונה של כל תשובה, תמיד.

🚨 דיוק מוחלט:
**אל תמציא** מתכונים, מצרכים, מידות, שמות מותגים, או מידע שלא כתוב בבסיס הידע למטה.

🔎 שימוש בבסיס הידע:
1. **יש תוכן למטה** → **חובה לשתף אותו!** גם אם לא מושלם — שתף/י בטבעיות.
2. **בסיס הידע ריק לגמרי** → אמור/י בקצרה ותזמין/י לשלוח DM.
3. 🚫 **לעולם** אל תגיד/י "לא דיברתי על X" כשיש תוכן — שתף/י מה שיש!

⚠️ כללים:
1. **ברכות**: "היי"/"שלום" → ענה חם (1-2 משפטים). **אל תציע** מוצרים/קופונים אלא אם ביקש.
2. **קופונים**: אם אין קופון למותג שביקשו — אמור בכנות, **אל תציע מותגים אחרים**.
3. **מתכונים ותוכן**: כשנותנים מתכון — תן אותו **מלא** עם מצרכים ושלבים. אם יש משהו דומה — הציע אותו!
4. **לינקים**: פורמט [טקסט](URL). העתק URL בדיוק כמו שהוא.

השם שלך: ${influencerName} (לעולם אל תכתוב [שם המשפיענית])`;

      const userPrompt = `${kbContext}

💬 הודעת המשתמש:
"${input.userMessage}"

ענה בעברית. אם השאלה רחבה — שאל/י שאלה מכוונת (עם רמז קצר למה שיש לך). אם ברור מה רוצים — תן/י תשובה מלאה.
🚨 אל תמציא תוכן שלא מופיע בבסיס הידע.`;

      // Resolve model based on decision engine's modelStrategy
      const { primary: primaryModel, fallback: fallbackModel } = resolveModel(input.modelTier);

      // Detect topic change to trim history
      const lastAssistant = input.conversationHistory
        ?.filter(m => m.role === 'assistant')
        .slice(-1)[0]?.content || '';
      const topicChanged = lastAssistant ? this.isTopicChange(input.userMessage, lastAssistant) : false;

      if (topicChanged) {
        console.log('[BaseArchetype] 🔀 Topic change detected — trimming history');
      }

      // Build conversation contents for Gemini
      // On topic change: only keep last 2 messages to avoid topic bleeding
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      if (input.conversationHistory?.length) {
        const historyToSend = topicChanged
          ? input.conversationHistory.slice(-2)
          : input.conversationHistory;
        for (const m of historyToSend) {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          });
        }
      }

      // Always add the current user message with KB context
      contents.push({ role: 'user', parts: [{ text: userPrompt }] });

      const client = getGeminiClient();

      // === STREAMING MODE (when onToken callback is provided) ===
      if (input.onToken) {
        console.log(`[BaseArchetype] Using Gemini STREAMING with ${primaryModel}`);
        try {
          const result = await this.streamGemini({
            model: primaryModel,
            systemInstruction: instructions,
            contents,
            onToken: input.onToken,
          });

          if (result.text) {
            return {
              text: this.replaceName(result.text, influencerName),
              responseId: null,
            };
          }
          throw new Error('Empty streaming response from primary model');

        } catch (primaryError) {
          console.warn(`[BaseArchetype] Primary model (${primaryModel}) failed, trying fallback:`, primaryError);

          const result = await this.streamGemini({
            model: fallbackModel,
            systemInstruction: instructions,
            contents,
            onToken: input.onToken,
          });

          if (result.text) {
            return {
              text: this.replaceName(result.text, influencerName),
              responseId: null,
            };
          }
          throw new Error('Empty streaming response from fallback model');
        }
      }

      // === BLOCKING MODE (backward compatible, no onToken) ===
      try {
        const response = await client.models.generateContent({
          model: primaryModel,
          contents,
          config: {
            systemInstruction: instructions,
            maxOutputTokens: MAX_TOKENS,
          },
        });

        const text = response.text || '';
        if (text) {
          return {
            text: this.replaceName(text, influencerName),
            responseId: null,
          };
        }
        throw new Error('Empty response from primary model');

      } catch (primaryError) {
        console.warn(`[BaseArchetype] Primary model (${primaryModel}) failed, trying fallback (${fallbackModel}):`, primaryError);

        const fallbackResponse = await client.models.generateContent({
          model: fallbackModel,
          contents,
          config: {
            systemInstruction: instructions,
            maxOutputTokens: MAX_TOKENS,
          },
        });

        const text = fallbackResponse.text || '';
        if (text) {
          return {
            text: this.replaceName(text, influencerName),
            responseId: null,
          };
        }
        throw new Error('Empty response from fallback model');
      }

    } catch (error) {
      console.error('[BaseArchetype] All models failed:', error);
      return {
        text: `היי, אני קצת מתקשה למצוא את המידע המדויק כרגע. ${influencerName} בדרך כלל משתפת המון טיפים בנושא הזה! אולי תוכלי לחדד את השאלה?`,
        responseId: null,
      };
    }
  }

  /**
   * Stream response using Gemini generateContentStream
   */
  private async streamGemini(params: {
    model: string;
    systemInstruction: string;
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
    onToken: (token: string) => void;
  }): Promise<{ text: string; responseId: string | null }> {
    const client = getGeminiClient();

    const response = await client.models.generateContentStream({
      model: params.model,
      contents: params.contents,
      config: {
        systemInstruction: params.systemInstruction,
        maxOutputTokens: MAX_TOKENS,
      },
    });

    let fullContent = '';

    for await (const chunk of response) {
      const text = chunk.text || '';
      if (text) {
        fullContent += text;
        params.onToken(text);
      }
    }

    return { text: fullContent, responseId: null };
  }

  /**
   * Build knowledge context string from knowledge base.
   * Delegates to compactKnowledgeContext for dedup + trimming.
   */
  private buildKnowledgeContext(kb: any): string {
    if (!kb) return '📚 **בסיס ידע:** אין מידע זמין כרגע.';

    const { context, stats } = compactKnowledgeContext(kb);

    console.log(`[BaseArchetype] Knowledge context: ${stats.inputChars} → ${stats.outputChars} chars (${stats.reductionPct}% reduction, ${stats.deduplicatedItems} deduped)`);

    return context;
  }

  /**
   * Detect if the user switched topics.
   * Compares meaningful-word overlap between the new message and last
   * assistant reply. Low overlap → topic change → don't pollute query.
   */
  private isTopicChange(userMessage: string, lastAssistantReply: string): boolean {
    // Hebrew stop-words / filler — skip these when comparing
    const STOP = new Set([
      'את','של','על','עם','זה','היא','הוא','אני','לי','לך','שלי','שלך',
      'מה','איך','למה','כמה','מתי','איפה','אם','גם','כל','הרבה','עוד',
      'יש','אין','היה','הזה','הזאת','אבל','רק','כן','לא','טוב','ממש',
      'בבקשה','תודה','אוקי','that','this','the','and','for','with','from',
    ]);

    const tokenise = (text: string): Set<string> => {
      const words = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')   // keep letters + numbers
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP.has(w));
      return new Set(words);
    };

    const userWords = tokenise(userMessage);
    const assistantWords = tokenise(lastAssistantReply);

    if (userWords.size === 0) return false; // can't tell — assume same topic

    let overlap = 0;
    for (const w of userWords) {
      if (assistantWords.has(w)) overlap++;
    }

    const overlapRatio = overlap / userWords.size;
    // If fewer than 20% of user words appear in the last reply → topic change
    return overlapRatio < 0.2;
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
