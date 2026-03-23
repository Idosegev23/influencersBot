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
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { buildPersonalityFromDB, type PersonalityConfig } from '../personality-wrapper';
import { compactKnowledgeContext } from '@/lib/rag/compact-knowledge-context';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model Configuration
const CHAT_MODEL = 'gpt-5.4'; // Full 5.4 — best quality for Hebrew chat
const FALLBACK_MODEL = 'gpt-5.4-mini-2026-03-17'; // 5.4-mini as fallback (faster, slightly lower quality)
const NANO_MODEL = 'gpt-5.4-nano-2026-03-17'; // ⚡ 2.3x faster, great TTFT for simple queries
const MAX_TOKENS = 2048; // Enough for full Hebrew recipes, routines, and detailed content

// Map decision engine model tiers to actual OpenAI model names
function resolveModel(tier?: 'nano' | 'standard' | 'full'): { primary: string; fallback: string } {
  switch (tier) {
    case 'nano':
      return { primary: NANO_MODEL, fallback: CHAT_MODEL };
    case 'full':
    case 'standard':
    default:
      return { primary: CHAT_MODEL, fallback: FALLBACK_MODEL };
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
    return text.replace(/\[שם המשפיענית\]|\[שם היוצר\/ת\]/g, name);
  }

  /**
   * Process user input and generate response
   */
  async process(input: ArchetypeInput): Promise<ArchetypeOutput> {
    // Extract influencer name early so it's available everywhere
    const influencerName = input.accountContext?.influencerName || 'היוצר/ת';

    // 1. Check guardrails first
    const triggeredGuardrails = this.checkGuardrails(input.userMessage);
    
    // If critical guardrail triggered, block and return safety message
    const criticalGuardrail = triggeredGuardrails.find(g => g.severity === 'critical');
    if (criticalGuardrail) {
      const rule = this.definition.guardrails.find(r => r.id === criticalGuardrail.ruleId);
      const rawResponse = rule?.blockedResponse || 'מצטער/ת, אני לא יכול/ה לעזור בזה. כדאי להתייעץ עם מומחה/ית.';
      
      return {
        response: this.replaceName(rawResponse, influencerName),
        triggeredGuardrails,
        knowledgeUsed: [],
        confidence: 1.0, // High confidence in safety block
      };
    }

    // 2. Extract history keywords for KB query enrichment
    // Always use recent context — let the model handle topic transitions naturally
    let historyKeywords = '';
    if (input.conversationHistory?.length) {
      historyKeywords = input.conversationHistory.slice(-4)
        .map(m => m.content)
        .join(' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 15)
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
  private buildAdditiveWidgetPrompt(prompt: any): string {
    const blocks: string[] = [];
    blocks.push('\n📋 הנחיות נוספות מבעל האתר:');

    if (prompt.additionalInstructions) {
      blocks.push(prompt.additionalInstructions);
    }

    const toneMap: Record<string, string> = {
      friendly: 'ידידותי וחם',
      professional: 'מקצועי ורשמי',
      casual: 'קז\'ואלי ולא פורמלי',
      formal: 'פורמלי ומנומס',
    };
    if (prompt.tone && toneMap[prompt.tone]) {
      blocks.push(`🎤 טון: ${toneMap[prompt.tone]}`);
    }

    if (prompt.focusTopics?.length) {
      blocks.push(`🎯 נושאים לדגש: ${prompt.focusTopics.join(', ')}`);
    }

    if (prompt.bannedTopics?.length) {
      blocks.push(`🚫 נושאים אסורים (סרב בנימוס ואל תדון בהם): ${prompt.bannedTopics.join(', ')}`);
    }

    if (prompt.faq?.length) {
      blocks.push('❓ שאלות נפוצות (עדיפות גבוהה — ענה לפי זה):');
      for (const item of prompt.faq.slice(0, 15)) {
        if (item.question && item.answer) {
          blocks.push(`• ש: ${item.question}\n  ת: ${item.answer}`);
        }
      }
    }

    return blocks.join('\n');
  }

  private buildPersonalityPrompt(config: PersonalityConfig, name: string): string {
    const lines: string[] = [];

    // Narrative perspective
    if (config.narrativePerspective === 'direct') {
      lines.push('דבר/י בגוף ראשון (אני, שלי).');
    } else if (config.narrativePerspective === 'sidekick-professional') {
      lines.push(`דבר/י כעוזר/ת של ${name}. השתמש/י ב"אנחנו" להמלצות.`);
    } else if (config.narrativePerspective === 'sidekick-personal') {
      lines.push('דבר/י בגוף ראשון רבים (אנחנו ממליצים, אנחנו אומרים).');
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
   * Build persona context block for the system prompt.
   * Uses rich JSONB fields (voice_rules, knowledge_map, boundaries, response_policy)
   * from chatbot_persona, falling back to simple bio/interests/directives.
   */
  private buildPersonaContextPrompt(config: PersonalityConfig, name: string): string {
    const sections: string[] = [];

    // --- Identity & Voice (from voice_rules) ---
    const vr = config.voiceRules;
    if (vr) {
      if (vr.identity?.who) {
        sections.push(`🪪 זהות:\n${vr.identity.who}`);
      }
      if (vr.tone) {
        const toneExtra = vr.toneSecondary?.length ? ` | ניואנסים: ${vr.toneSecondary.join(', ')}` : '';
        sections.push(`🎤 טון: ${vr.tone}${toneExtra}`);
      }
      if (vr.responseStructure) {
        sections.push(`📐 מבנה תשובה טיפוסי:\n${vr.responseStructure}`);
      }
      if (vr.answerExamples?.length) {
        sections.push(`💡 דפוסי תשובה:\n${vr.answerExamples.map(e => `• ${e}`).join('\n')}`);
      }
    } else if (config.bio) {
      // Fallback to simple bio
      sections.push(`📋 ביוגרפיה של ${name}:\n${config.bio}`);
    }

    // --- Knowledge Map (core topics) ---
    const km = config.knowledgeMap;
    if (km?.coreTopics?.length) {
      const topicLines = km.coreTopics.map(t => {
        const subs = t.subtopics?.length ? ` (${t.subtopics.join(', ')})` : '';
        const points = t.keyPoints?.slice(0, 2).map(p => `  - ${p}`).join('\n') || '';
        return `• ${t.name}${subs}${points ? '\n' + points : ''}`;
      }).join('\n');
      sections.push(`📚 תחומי ידע של ${name}:\n${topicLines}`);
    } else if (config.interests?.length) {
      // Fallback to simple interests
      sections.push(`🎯 תחומי עניין: ${config.interests.join(', ')}`);
    }

    // --- Boundaries ---
    const bd = config.boundaries;
    if (bd?.discussed?.length) {
      sections.push(`✅ נושאים שהיא מדברת עליהם: ${bd.discussed.join(', ')}`);
    }
    if (bd?.uncertainAreas?.length) {
      sections.push(`⚠️ אזורי אי-ודאות (היזהר):\n${bd.uncertainAreas.map(a => `• ${a}`).join('\n')}`);
    }

    // --- Response Policy ---
    const rp = config.responsePolicy;
    if (rp) {
      const policyLines: string[] = [];
      if (rp.refuse?.length) {
        policyLines.push(`🚫 סרב:\n${rp.refuse.map(r => `• ${r}`).join('\n')}`);
      }
      if (rp.cautious?.length) {
        policyLines.push(`⚠️ זהירות:\n${rp.cautious.map(c => `• ${c}`).join('\n')}`);
      }
      if (rp.refusalStyle) {
        policyLines.push(`סגנון סירוב: ${rp.refusalStyle}`);
      }
      if (policyLines.length) {
        sections.push(`📜 מדיניות תשובה:\n${policyLines.join('\n')}`);
      }
    }

    // --- Simple directives (always add if present) ---
    if (config.directives) {
      sections.push(`📌 הנחיות מיוחדות:\n${config.directives}`);
    }

    return sections.length > 0 ? '\n' + sections.join('\n\n') : '';
  }

  /**
   * Build proactive conversation enrichment block for the system prompt.
   * Combines: clarifications (step 1), coupon hints (step 2+3), deepening topics (step 4).
   */
  private buildProactiveBlock(input: ArchetypeInput): string {
    const sections: string[] = [];

    // Step 1: Suggested clarifications from understanding engine
    if (input.suggestedClarifications?.length) {
      sections.push(
        `\n🔍 שאלות הבהרה מומלצות (אם ההודעה לא ברורה מספיק, שאל/י אחת מהן בטבעיות):\n${input.suggestedClarifications.map(q => `• "${q}"`).join('\n')}`
      );
    }

    // Step 2+3: Active coupons for proactive mention in response + suggestions
    if (input.activeCoupons?.length) {
      const couponList = input.activeCoupons.slice(0, 5).map(c =>
        `• ${c.brand_name}: קוד ${c.coupon_code}${c.description ? ` (${c.description})` : ''}`
      ).join('\n');
      sections.push(
        `\n🎁 קופונים פעילים — אם בשיחה עולה מותג שיש לו קופון, הזכר/י את הקופון בטבעיות (לא בכוח!):\n${couponList}\n• אם הנושא רלוונטי — שלב/י הזכרה קצרה בתשובה: "אגב, יש לי קוד הנחה ל-X אם מעניין אותך"\n• אחת מ-3 ההצעות (SUGGESTIONS) יכולה להיות על קופון רלוונטי`
      );
    }

    // Step 4: Conversation deepening based on rolling summary / recurring topics
    if (input.conversationTopics?.length) {
      sections.push(
        `\n💡 נושאים שחוזרים בשיחה (הזדמנות להעמקה):\n${input.conversationTopics.map(t => `• ${t}`).join('\n')}\n• אם המשתמש/ת חוזר/ת לנושא — הציע/י להעמיק: "שמתי לב שזה מעניין אותך — רוצה שאפרט?"\n• שלב/י את הנושאים האלה בהצעות (SUGGESTIONS) כשמתאים`
      );
    }

    return sections.length > 0 ? '\n' + sections.join('\n') : '';
  }

  /**
   * Generate AI response using OpenAI Responses API (GPT-5.2)
   * Uses previous_response_id for server-side context chaining.
   * Supports real-time streaming via onToken callback.
   */
  protected async generateAIResponse(
    input: ArchetypeInput,
    knowledgeQuery: string
  ): Promise<{ text: string; responseId?: string | null }> {
    const influencerName = input.accountContext.influencerName || 'היוצר/ת';

    try {
      // Build context from knowledge base
      const kbContext = this.buildKnowledgeContext(input.knowledgeBase);

      // Build personality + persona context prompt (always — not just for streaming)
      let personalityBlock = '';
      let personaContextBlock = '';
      let personalityConfig: any = input.personalityConfig;
      try {
        personalityConfig = personalityConfig || await buildPersonalityFromDB(input.accountContext.accountId);
        personalityBlock = `\n🎭 סגנון אישיות:\n${this.buildPersonalityPrompt(personalityConfig, influencerName)}`;
        personaContextBlock = this.buildPersonaContextPrompt(personalityConfig, influencerName);
      } catch (e) {
        console.warn('[BaseArchetype] Failed to load personality, using defaults');
      }

      // Build archetype-specific instructions (replaces system prompt)
      const todayDate = new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const isMediaNews = input.accountContext.accountArchetype === 'media_news';

      const mediaNewsBlock = isMediaNews ? `
📰 **אתה ערוץ חדשות בידור** — לא משפיען רגיל. כללים קריטיים:
• **התאריך היום: ${todayDate}**. חשב תמיד כמה זמן עבר מאז הפוסט. אם פוסט מלפני שבועות — **אל תגיד "במוצ״ש הקרוב"** או "מחר". תגיד "היה ב..." או "לפני X ימים".
• בדוק את השדה posted_at/timestamp של כל פוסט ותחשב את הרלוונטיות הזמנית. אם משהו ישן — ציין שזה כבר קרה.
• דבר כמו עורך חדשות חד ומדויק — לא מרגש מדי, לא רופס. עובדות קודם, רגשות אחרי.
• אל תגיד "אצלי" או "מהמידע שלי" — דבר כאילו אתה כתב חדשות שמכיר את הנושא.
• אם יש הקשר חם (מתויג [נושא חם:]) — זה הנושא המרכזי, התמקד בו. תן תשובה ממוקדת וחדה.
` : '';

      const instructions = `אתה ${influencerName}, ${isMediaNews ? 'ערוץ חדשות בידור שמנהל שיחה עם הקהל — חד, מדויק ועדכני' : 'יוצר/ת תוכן שמנהל/ת שיחה טבעית עם הקהל — בגובה העיניים, לא כמו מכונת חיפוש'}.
📅 תאריך היום: ${todayDate}
${mediaNewsBlock}
⚠️ **מגדר**: ${(personalityConfig?.voiceRules?.firstPerson && /נקבה|female|feminine/i.test(personalityConfig.voiceRules.firstPerson)) ? 'דברי בלשון נקבה. פני לעוקבות בלשון נקבה כברירת מחדל, אלא אם ברור שמדובר בגבר.' : (personalityConfig?.voiceRules?.firstPerson && /זכר|male|masculine/i.test(personalityConfig.voiceRules.firstPerson)) ? 'דבר בלשון זכר. פנה לעוקבים בלשון ניטרלית או זכר כברירת מחדל.' : 'דבר/י בלשון ניטרלית. השתמש/י בסלאש כשצריך: "ממליצ/ה", "אומר/ת".'}
⚠️ **אל תפתח/י כל הודעה עם כינויי חיבה** ("מאמי", "אהובה", "יקירה"). תפתח/י ישר לעניין. כינוי חיבה מותר לפעמים, לא בכל הודעה.

📜 הקשר שיחה: **תמיד** תבין/י הפניות להיסטוריה ("המתכון", "מה שאמרת", "זה"). השיחה זורמת — אל תתנהג/י כאילו כל הודעה מתחילה מאפס.
• אם המשתמש/ת שואל/ת שאלת המשך (למשל "איזה תבלינים לשפר?" אחרי מתכון) — **חבר/י את זה לנושא הקודם** ותן/י תשובה ספציפית.
• רק אם ברור לחלוטין שהמשתמש/ת עבר/ה לנושא אחר (שאלה על מוצר אחר / נושא לא קשור) — ענה/י רק על הנושא החדש.

🎯 תפקיד: ${this.definition.name}
📝 ${this.definition.description}

${this.definition.logic.responseTemplates?.length ? '📋 איך לענות:\n' + this.definition.logic.responseTemplates.map(t => `• ${t.situation}: ${t.template}`).join('\n') : ''}
${personalityBlock}${personaContextBlock}
${input.mode === 'dm' ? `
📱 מצב DM באינסטגרם — שיחה אישית וטבעית:

📏 פורמט הודעה:
• ⚠️ **חשוב מאוד**: אינסטגרם DM לא תומך ב-markdown! אין bold, italic, headers, או bullet points.
• כתוב טקסט רגיל בלבד — ללא כוכביות, ללא תחתיות, ללא סוגריים מרובעים.
• השתמש באימוג'ים כסימני נקודות: ✅, 📌, 💡, 🔥, ✨ במקום bullets.
• הפרד בין נושאים עם שורה ריקה.
• מספור ידני (1. 2. 3.) במקום רשימות.
• שמור הודעות קצרות וקריאות — עד 800 תווים מועדפים (המערכת תפצל אוטומטית אם צריך).

🔗 לינקים ותמונות:
• 🚫 אל תשתמש בפורמט markdown ללינקים [טקסט](URL).
• במקום זאת כתוב: "הלינק: https://example.com" או "תבדקי כאן 👉 https://example.com"
• 🚫 אל תשלב תמונות — DM לא מציג תמונות inline.

💬 סגנון:
• דבר כאילו אתה שולח הודעה ישירה לחבר — חם, אישי, וקצר.
• פסקאות קצרות כמו בווטסאפ.
• אל תהיה פורמלי מדי — זו שיחת DM, לא אתר.` : ''}
${input.mode === 'widget' ? `
🛒 מצב ווידג'ט — מכירתי וקצר:

📏 אורך תשובה:
• תשובה קצרה וממוקדת — **מקסימום 2-3 מוצרים** בכל תשובה.
• אל תפרט יותר מדי — משפט אחד לכל מוצר מספיק.
• אם יש הרבה אופציות — שאל שאלה ממוקדת לפני שמציע מוצרים.
• אל תחזור על מידע שכבר נאמר (משלוח חינם, ימי החזרה — פעם אחת מספיק).

🔗 מוצרים עם לינקים ותמונות:
• כל מוצר חייב לינק: [שם המוצר](URL מבסיס הידע)
• כל מוצר עם תמונה (🖼️) — הוסף שורה לפניו: ![שם](IMAGE_URL)
• דוגמה לפורמט נכון:
  ![שמפו קוקוס](https://res.cloudinary.com/xxx.webp)
  [שמפו קוקוס 450 מל](https://argania-oil.co.il/product/xxx) — ₪49.90
• תמונות רק מ-cloudinary או quickshop. 🚫 לא butterfly-button.
• 🚫 אל תכתוב שם מוצר בלי לינק.

💰 קופונים והנעה:
• קופון רלוונטי — הציע פרואקטיבית.
• CTA קצר בסוף.
• ענה בגוף שלישי ("אצלנו יש...", "באתר תמצא/י...").` : ''}
${input.mode === 'widget' && input.widgetConfig?.prompt ? this.buildAdditiveWidgetPrompt(input.widgetConfig.prompt) : ''}
${input.mode === 'widget' && input.widgetConfig?._recommendationBlock ? `\n${input.widgetConfig._recommendationBlock}\n` : ''}
💬 סגנון שיחה — פרסונלי ומכוון:
• **שאלות רחבות** ("יש לך מתכון לפסטה?"): רמוז/י שיש לך כמה אפשרויות ותשאל/י שאלה מכוונת — "שמנת או עגבניות? משהו מהיר ליומיום או לאירוח?" — כדי לתת בדיוק מה שצריך.
• **שאלות ספציפיות** ("מה המתכון לרביולי בטטה?"): תן/י תשובה מלאה ומפורטת ישר — אל תשאל/י שאלות מיותרות.
• **תשובות לשאלה שלך** (המשתמש ענה "שמנת" / "לאירוח"): תן/י את התשובה המלאה בהתאם לבחירה, בלי עוד שאלות.
• **אחרי כל תשובה**: הציע/י בקצרה המשך טבעי אחד בתוך הטקסט.
• 1-2 אימוג'ים מקסימום לכל תשובה.
${this.buildProactiveBlock(input)}

${input.mode === 'widget' ? `📌 בווידג'ט — 🚫 אל תוסיף <<SUGGESTIONS>>. אין כפתורי המשך בווידג'ט. סיים את התשובה ב-CTA טבעי בתוך הטקסט.` : `📌 המלצות המשך:
בסוף **כל** תשובה, הוסף שורה אחרונה בפורמט הזה בדיוק:
<<SUGGESTIONS>>הצעה 1|הצעה 2|הצעה 3<</SUGGESTIONS>>
• 2-3 הצעות קצרות (עד 6 מילים כל אחת) שקשורות **ישירות** לנושא השיחה הנוכחי.
• ⚡ עדיפות: שאלת המשך טבעית על מה שדיברנו > תוכן ספציפי מבסיס הידע > שאלה כללית.
• ההצעות צריכות להישמע כמו שאלה שהעוקב/ת באמת היה/היתה שואל/ת — לא כמו תפריט.
• ⚠️ זה חייב להיות בשורה האחרונה של כל תשובה, תמיד.`}

🚨 דיוק מוחלט:
🔴 **חשוב ביותר**: ענה/י **רק** על בסיס המידע שסופק למטה. אם המידע לא נמצא בבסיס הידע — אמור/י "לא מצאתי מידע על זה אצלי" בטבעיות, ולעולם אל תמציא/י.
**אל תמציא** מתכונים, מצרכים, מידות, שמות מותגים, או מידע שלא כתוב בבסיס הידע למטה.

🔎 שימוש בבסיס הידע:
1. **יש תוכן למטה** → **חובה להשתמש בו!** דבר/י בביטחון, כאילו את/ה מכיר/ה את המוצרים אישית. לא "מה שיש לי פה" / "מהמידע שקיבלתי" / "מהחומרים" — פשוט ספר/י ישר.
2. **ציין/י שמות ספציפיים**: אם יש שם מוצר (שמפו, מסכה, סרום, ספריי וכו') — ציין/י אותו בשמו! לא "הסדרות שלהם" אלא "השמפו של X, המסכה של Y".
3. **בסיס הידע ריק לגמרי** → אמור/י בקצרה ותזמין/י לשלוח DM.
4. 🚫 **לעולם** אל תגיד/י "לא דיברתי על X" כשיש תוכן — שתף/י מה שיש!
5. 🚫 **ביטויים אסורים**: "מה יש לנו פה", "מהמידע שסופק", "מהחומרים שיש", "לא נמצא לי מידע מדויק" — אלה נשמעים רובוטיים. דבר/י טבעית!

⚠️ כללים:
1. **ברכות**: "היי"/"שלום" → ענה חם (1-2 משפטים). **אל תציע** מוצרים/קופונים אלא אם ביקש.
2. **קופונים ושותפויות**: חפש בגמישות! "fre"="FRÉ", "קליניק"="Clinique", "לוריאל"="L'Oréal", "אולוויז"="Always" וכו'. **כתיב חלקי, עברית, אנגלית, עם/בלי גרשיים — הכל תואם.** אם יש קופון לאותו מותג בשותפויות — **תן אותו!** אם באמת אין — אמור בכנות, אל תציע מותגים אחרים.
3. **מתכונים ותוכן**: כשנותנים מתכון — תן אותו **מלא** עם מצרכים ושלבים. אם יש משהו דומה — הציע אותו!
4. **לינקים**: פורמט [טקסט](URL). העתק URL בדיוק כמו שהוא.

השם שלך: ${influencerName} (לעולם אל תכתוב [שם המשפיענית])`;

      const userNameLine = input.userName ? `\n👤 שם המשתמש/ת: ${input.userName} — פנה/י אליו/ה בשם כשזה מתאים באופן טבעי.\n` : '';
      const userPrompt = `${kbContext}
${userNameLine}
💬 הודעת המשתמש:
"${input.userMessage}"

ענה בעברית. אם השאלה רחבה — שאל/י שאלה מכוונת (עם רמז קצר למה שיש לך). אם ברור מה רוצים — תן/י תשובה מלאה.
🚨 אל תמציא תוכן שלא מופיע בבסיס הידע.`;

      // Resolve model based on decision engine's modelStrategy
      const { primary: primaryModel, fallback: fallbackModel } = resolveModel(input.modelTier);

      // Context chaining via OpenAI Responses API
      // Always try to keep the chain alive — the model manages server-side context
      // and handles topic transitions naturally
      const previousResponseId = input.previousResponseId || null;

      // Build input for Responses API
      // When we have previous_response_id, OpenAI manages context server-side.
      // We only send the new user message + fresh KB context.
      // When no previous_response_id (first message), we include
      // conversation history manually so the model has context.
      const inputMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      if (!previousResponseId && input.conversationHistory?.length) {
        // No chain: include full history (already limited to 10 messages from DB)
        for (const m of input.conversationHistory) {
          inputMessages.push({ role: m.role, content: m.content });
        }
      }

      // Always add the current user message with KB context
      inputMessages.push({ role: 'user', content: userPrompt });

      // === STREAMING MODE (when onToken callback is provided) ===
      if (input.onToken) {
        console.log(`[Model] 🚀 Streaming | model=${primaryModel} | fallback=${fallbackModel} | tier=${input.modelTier || 'default'}${previousResponseId ? ' | chained' : ''}`);
        try {
          const result = await this.streamResponsesAPI({
            model: primaryModel,
            instructions,
            input: inputMessages,
            previousResponseId,
            onToken: input.onToken,
          });

          if (result.text) {
            return {
              text: this.replaceName(result.text, influencerName),
              responseId: result.responseId,
            };
          }
          throw new Error('Empty streaming response from primary model');

        } catch (primaryError) {
          console.warn(`[Model] ⚠️ ${primaryModel} FAILED, falling back to ${fallbackModel}:`, primaryError);

          // Fallback: no previous_response_id (chain is model-specific)
          const result = await this.streamResponsesAPI({
            model: fallbackModel,
            instructions,
            input: inputMessages,
            previousResponseId: null,
            onToken: input.onToken,
          });

          if (result.text) {
            return {
              text: this.replaceName(result.text, influencerName),
              responseId: result.responseId,
            };
          }
          throw new Error('Empty streaming response from fallback model');
        }
      }

      // === BLOCKING MODE (backward compatible, no onToken) ===
      console.log(`[Model] 🔄 Blocking | model=${primaryModel} | fallback=${fallbackModel} | tier=${input.modelTier || 'default'}`);
      try {
        const blockStart = Date.now();
        const response = await openai.responses.create({
          model: primaryModel,
          instructions,
          input: inputMessages,
          ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
          max_output_tokens: MAX_TOKENS,
          reasoning: { effort: 'low' },
        });

        const blockMs = Date.now() - blockStart;
        const usage = (response as any).usage;
        console.log(`[Model] ✅ ${primaryModel} | Total: ${blockMs}ms | Tokens: ${usage?.input_tokens || 0}→${usage?.output_tokens || 0} | Chars: ${response.output_text?.length || 0}`);

        if (response.output_text) {
          return {
            text: this.replaceName(response.output_text, influencerName),
            responseId: response.id,
          };
        }
        throw new Error('Empty response from primary model');

      } catch (primaryError) {
        console.warn(`[Model] ⚠️ ${primaryModel} FAILED, falling back to ${fallbackModel}:`, primaryError);

        const fbStart = Date.now();
        const fallbackResponse = await openai.responses.create({
          model: fallbackModel,
          instructions,
          input: inputMessages,
          max_output_tokens: MAX_TOKENS,
          reasoning: { effort: 'low' },
        });

        const fbMs = Date.now() - fbStart;
        const fbUsage = (fallbackResponse as any).usage;
        console.log(`[Model] ✅ ${fallbackModel} (fallback) | Total: ${fbMs}ms | Tokens: ${fbUsage?.input_tokens || 0}→${fbUsage?.output_tokens || 0} | Chars: ${fallbackResponse.output_text?.length || 0}`);

        if (fallbackResponse.output_text) {
          return {
            text: this.replaceName(fallbackResponse.output_text, influencerName),
            responseId: fallbackResponse.id,
          };
        }
        throw new Error('Empty response from fallback model');
      }

    } catch (error) {
      console.error('[BaseArchetype] All models failed:', error);
      return {
        text: `אופס, משהו השתבש... אפשר לנסות שוב?`,
        responseId: null,
      };
    }
  }

  /**
   * Stream response using OpenAI Responses API
   */
  private async streamResponsesAPI(params: {
    model: string;
    instructions: string;
    input: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousResponseId: string | null;
    onToken: (token: string) => void;
  }): Promise<{ text: string; responseId: string | null }> {
    const streamStart = Date.now();
    let ttftMs: number | null = null;

    const stream = await openai.responses.create({
      model: params.model,
      instructions: params.instructions,
      input: params.input,
      ...(params.previousResponseId ? { previous_response_id: params.previousResponseId } : {}),
      max_output_tokens: MAX_TOKENS,
      reasoning: { effort: 'low' },
      stream: true,
    });

    let fullContent = '';
    let responseId: string | null = null;
    let tokensIn = 0;
    let tokensOut = 0;

    for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
      if (event.type === 'response.output_text.delta') {
        const delta = (event as any).delta as string;
        if (delta) {
          if (ttftMs === null) ttftMs = Date.now() - streamStart;
          fullContent += delta;
          params.onToken(delta);
        }
      }
      if (event.type === 'response.completed') {
        responseId = (event as any).response?.id || null;
        const usage = (event as any).response?.usage;
        if (usage) {
          tokensIn = usage.input_tokens || 0;
          tokensOut = usage.output_tokens || 0;
        }
      }
    }

    const totalMs = Date.now() - streamStart;
    console.log(`[Model] ✅ ${params.model} | TTFT: ${ttftMs}ms | Total: ${totalMs}ms | Tokens: ${tokensIn}→${tokensOut} | Chars: ${fullContent.length}`);

    return { text: fullContent, responseId };
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
