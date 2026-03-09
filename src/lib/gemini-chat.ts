import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

// Initialize Gemini - support both env var names (for backward compatibility)
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// Initialize OpenAI for GPT-5.2 Pro persona building
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Models configuration
export const AI_MODELS = {
  PERSONA_BUILDER: 'gpt-5.2-pro',               // 🚀 GPT-5.2 Pro for DEEP persona building (quality, depth, reasoning)
  CHAT_RESPONSES: 'gemini-3-flash-preview',     // For real-time chat (speed, cost) - handled by sandwich-bot
  ANALYSIS: 'gemini-3-flash-preview',           // For quick analysis
} as const;

/**
 * Build persona using GPT-5.2 Pro with HIGH reasoning + verbosity
 * 🚀 ULTIMATE DEEP ANALYSIS - runs once when creating/updating persona
 * 
 * NOTE: Despite the function name, this now uses GPT-5.2 Pro (not Gemini).
 * Name kept for backward compatibility.
 */
export async function buildPersonaWithGemini(input: {
  username: string;
  bio: string;
  interests: string[];
  enrichedPosts?: Array<{
    caption: string;
    type: string;
    engagement: any;
    timestamp: string;
  }>;
  analytics?: {
    contentAnalysis: any;
    engagementPatterns: any;
    postingBehavior: any;
    topPerformingPosts: any[];
  };
  customDirectives?: string[];
}) {
  console.log(`🧠 [GPT-5.2 Pro] Building DEEP persona for @${input.username}...`);

  const prompt = `אתה מומחה בבניית פרסונות אותנטיות למשפיענים.

תפקידך: ליצור פרסונה עמוקה ואותנטית עבור ${input.username} שתשמש את הצ'אטבוט שלה/שלו.

📊 נתוני פרופיל:
Bio: ${input.bio}
תחומי עניין מזוהים: ${input.interests.join(', ')}

${input.analytics ? `
🎯 ניתוח מעמיק של התוכן:
- סגנון כתיבה: ${input.analytics.contentAnalysis.writingStyle}
- אורך ממוצע: ${input.analytics.contentAnalysis.avgCaptionLength} תווים (${input.analytics.contentAnalysis.avgWordsPerPost} מילים)
- צפיפות אימוג'ים: ${input.analytics.contentAnalysis.emojiDensity}%
- שימוש בשאלות: ${input.analytics.contentAnalysis.questionFrequency}% מהפוסטים
- סוגי תוכן: ${JSON.stringify(input.analytics.contentAnalysis.contentTypeDistribution)}

📈 דפוסי אנגייג'מנט:
- ממוצע לייקים: ${input.analytics.engagementPatterns.avgLikes}
- ממוצע תגובות: ${input.analytics.engagementPatterns.avgComments}
- סוג תוכן מעניין ביותר: ${input.analytics.engagementPatterns.mostEngagingType}
- טרנד אנגייג'מנט: ${input.analytics.engagementPatterns.engagementTrend}

⏰ התנהגות פרסום:
- שעות פעילות: ${input.analytics.postingBehavior.mostActiveHours?.join(', ')}
- ימים פעילים: ${input.analytics.postingBehavior.mostActiveDays?.join(', ')}
- תדירות: ${input.analytics.postingBehavior.postingFrequency}

🔥 פוסטים ויראליים (TOP 5):
${input.analytics.topPerformingPosts?.map((p, i) => `${i + 1}. [${p.engagement_rate} engagement] ${p.caption.substring(0, 150)}...`).join('\n')}
` : ''}

📝 פוסטים לדוגמה (${input.enrichedPosts?.length || 0} אחרונים):
${input.enrichedPosts?.slice(0, 10).map((post, i) => `
${i + 1}. [${post.type}] [Engagement: ${post.engagement.rate}%]
${post.caption.substring(0, 300)}${post.caption.length > 300 ? '...' : ''}
`).join('\n---\n') || 'אין פוסטים זמינים'}

${input.customDirectives?.length ? `\n🎯 הנחיות מיוחדות מהמשפיען:\n${input.customDirectives.join('\n')}` : ''}

בנה פרסונה מפורטת בפורמט JSON עם השדות הבאים:

{
  "voiceAndTone": "איך המשפיען/ית מדבר/ת (גוף ראשון, סגנון, אישיות, התבסס על הפוסטים)",
  "knowledgeAreas": ["תחום 1 שהמשפיען מומחה בו", "תחום 2", "..."],
  "conversationStyle": "תיאור מפורט של איך לנהל שיחה (חם/פורמלי/הומוריסטי, התבסס על הדאטה)",
  "contentPreferences": {
    "preferredFormats": ["סוג התוכן שהמשפיען מעדיף - Image/Video/Reel"],
    "writingStyle": "תמציתי/בינוני/מפורט - כמו שזוהה בניתוח",
    "emojiUsage": "heavy/moderate/minimal/none - לפי הצפיפות",
    "postingTimes": ["שעות מועדפות לפרסום"]
  },
  "dosList": [
    "תמיד דבר בגוף ראשון כנציג של המשפיען",
    "השתמש בסגנון הכתיבה המזוהה (תמציתי/מפורט/אימוג'ים)",
    "...עוד הנחיות מבוססות דאטה"
  ],
  "dontsList": [
    "אל תדבר בסגנון שונה מהמשפיען",
    "אל תדבר על נושאים שלא הוזכרו בתוכן",
    "..."
  ],
  "personalInfo": {
    "location": "מיקום אם צוין בביו או פוסטים",
    "hobbies": ["תחביב 1 מזוהה מהפוסטים", "..."],
    "favorites": {
      "places": ["מקומות שהוזכרו בפוסטים"],
      "activities": ["פעילויות מזוהות"],
      "topics": ["נושאים שהמשפיען מדבר עליהם הכי הרבה"]
    }
  },
  "viralContentInsights": "תובנות מהפוסטים הויראליים - מה עובד טוב",
  "responseExamples": {
    "greeting": "דוגמה לברכה בסגנון המשפיען",
    "productQuestion": "דוגמה לשאלה על מוצר",
    "personalQuestion": "דוגמה לשאלה אישית"
  }
}

חשוב: התשובה חייבת להיות JSON תקין בלבד, ללא טקסט נוסף.`;

  try {
    const response = await openai.responses.create({
      model: AI_MODELS.PERSONA_BUILDER,
      input: prompt,
      reasoning: {
        effort: 'high', // 🧠 DEEP THINKING!
      },
      text: {
        verbosity: 'high', // 📝 DETAILED OUTPUT!
      },
    });

    const persona = JSON.parse((response as any).output || '{}');
    
    console.log('✅ [GPT-5.2 Pro] Persona built successfully!');
    console.log(`📊 Reasoning tokens: ${(response as any).usage?.reasoning_tokens || 0}`);
    
    return persona;

  } catch (error) {
    console.error('❌ [GPT-5.2 Pro] Failed to build persona:', error);
    throw error;
  }
}

/**
 * Chat with Gemini 3 Flash (fast responses)
 */
export async function chatWithGemini(input: {
  message: string;
  persona: any; // Full persona from DB
  context: string; // Products, partnerships, coupons
  conversationHistory?: Array<{ role: 'user' | 'model'; text: string }>;
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.CHAT_RESPONSES });

  // Build system instructions from persona
  const systemInstructions = buildSystemInstructions(input.persona);

  // Build chat history
  const history = input.conversationHistory?.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  })) || [];

  // Start chat with properly formatted system instruction
  const chat = model.startChat({
    history,
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemInstructions }],
    },
  });

  // Send message with context
  const fullMessage = `${input.context ? `\n\n[הקשר זמין:\n${input.context}\n]\n\n` : ''}${input.message}`;
  
  const result = await chat.sendMessage(fullMessage);
  const response = result.response;
  
  return {
    text: response.text(),
    usage: {
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Stream chat with Gemini 3 Flash (for real-time responses)
 */
export async function streamChatWithGemini(input: {
  message: string;
  persona: any;
  context: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; text: string }>;
  onDelta: (text: string) => void;
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.CHAT_RESPONSES });

  // Build system instructions from persona
  const systemInstructions = buildSystemInstructions(input.persona);

  // Build chat history
  const history = input.conversationHistory?.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  })) || [];

  // Start chat with properly formatted system instruction
  const chat = model.startChat({
    history,
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemInstructions }],
    },
  });

  // Send message with context
  const fullMessage = `${input.context ? `\n\n[הקשר זמין:\n${input.context}\n]\n\n` : ''}${input.message}`;
  
  const result = await chat.sendMessageStream(fullMessage);
  
  let fullText = '';
  
  // Stream response
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    fullText += chunkText;
    input.onDelta(chunkText);
  }
  
  // Get final usage stats
  const finalResponse = await result.response;
  
  return {
    text: fullText,
    usage: {
      promptTokens: finalResponse.usageMetadata?.promptTokenCount || 0,
      completionTokens: finalResponse.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: finalResponse.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Build system instructions from persona
 * Enhanced to use new structure: voice_rules, knowledge_map, boundaries, response_policy
 */
function buildSystemInstructions(persona: any): string {
  const instructions = [];

  // Base identity - use voice_rules.identity (v2) or fallback
  if (persona.voice_rules?.identity?.who) {
    instructions.push(`אתה ${persona.voice_rules.identity.who}`);
  } else {
    instructions.push(`אתה ${persona.name || 'המשפיען/ית'}.`);
  }

  // Enhanced voice and tone from voice_rules
  if (persona.voice_rules) {
    instructions.push(`\n🎭 סגנון דיבור ותשובה:`);
    instructions.push(`- טון ראשי: ${persona.voice_rules.tone}`);

    // v2: secondary tones
    if (persona.voice_rules.toneSecondary?.length > 0) {
      instructions.push(`- טונים משניים: ${persona.voice_rules.toneSecondary.join(', ')}`);
    }

    instructions.push(`- מבנה תשובה: ${persona.voice_rules.responseStructure}`);
    instructions.push(`- אורך ממוצע: ${persona.voice_rules.avgLength}`);

    // v2: answer examples
    if (persona.voice_rules.answerExamples?.length > 0) {
      instructions.push(`- דוגמאות תבנית: ${persona.voice_rules.answerExamples.slice(0, 2).join(' | ')}`);
    }

    // v2: first person usage
    if (typeof persona.voice_rules.firstPerson === 'string') {
      instructions.push(`- גוף דיבור: ${persona.voice_rules.firstPerson}`);
    }
    if (persona.voice_rules.firstPersonExamples?.length > 0) {
      instructions.push(`- דוגמאות: "${persona.voice_rules.firstPersonExamples.slice(0, 3).join('", "')}"`);
    }

    if (persona.voice_rules.recurringPhrases?.length > 0) {
      instructions.push(`- ביטויים מאפיינים: ${persona.voice_rules.recurringPhrases.slice(0, 5).join(', ')}`);
    }

    if (persona.voice_rules.avoidedWords?.length > 0) {
      instructions.push(`- מילים להימנע מהן: ${persona.voice_rules.avoidedWords.slice(0, 5).join(', ')}`);
    }
  } else if (persona.voice_and_tone || persona.voiceAndTone) {
    instructions.push(`\n🎭 סגנון דיבור:\n${persona.voice_and_tone || persona.voiceAndTone}`);
  }

  // Bio - keep for backward compatibility
  if (persona.bio) {
    instructions.push(`\n👤 עליך:\n${persona.bio}`);
  }

  // Knowledge Map - NEW!
  if (persona.knowledge_map?.coreTopics?.length > 0) {
    instructions.push(`\n📚 מפת הידע שלך (מבוסס על תוכן אמיתי):`);
    persona.knowledge_map.coreTopics.forEach((topic: any) => {
      instructions.push(`\n- ${topic.name}:`);
      if (topic.keyPoints?.length > 0) {
        topic.keyPoints.slice(0, 3).forEach((point: string) => {
          instructions.push(`  * ${point}`);
        });
      }
    });
  } else if (persona.interests?.length) {
    instructions.push(`\n❤️ תחומי עניין: ${persona.interests.join(', ')}`);
  }

  // Boundaries - NEW!
  if (persona.boundaries) {
    instructions.push(`\n🚧 גבולות הידע:`);
    
    if (persona.boundaries.discussed?.length > 0) {
      instructions.push(`- נושאים שדיברת עליהם: ${persona.boundaries.discussed.slice(0, 10).join(', ')}`);
    }
    
    if (persona.boundaries.notDiscussed?.length > 0) {
      instructions.push(`- נושאים שלא דיברת עליהם: ${persona.boundaries.notDiscussed.slice(0, 5).join(', ')}`);
      instructions.push(`  ⚠️ אם נשאלת על אחד מהם, תגיד בנימוס שאין לך מספיק מידע על זה`);
    }
  }

  // Response Policy - NEW!
  if (persona.response_policy) {
    instructions.push(`\n🎯 מדיניות תשובה:`);
    
    if (persona.response_policy.highConfidence?.length > 0) {
      instructions.push(`- ענה בביטחון על: ${persona.response_policy.highConfidence.slice(0, 3).join(', ')}`);
    }
    
    if (persona.response_policy.cautious?.length > 0) {
      instructions.push(`- ענה בזהירות על: ${persona.response_policy.cautious.slice(0, 3).join(', ')}`);
    }
    
    if (persona.response_policy.refuse?.length > 0) {
      instructions.push(`- סרב לענות על: ${persona.response_policy.refuse.slice(0, 3).join(', ')}`);
    }

    // v2: refusal style
    if (persona.response_policy.refusalStyle) {
      instructions.push(`- סגנון סירוב: ${persona.response_policy.refusalStyle}`);
    }
  }

  // Tone setting - keep for backward compatibility
  const toneMap: Record<string, string> = {
    friendly: 'דבר/י בצורה חמה וידידותית',
    professional: 'שמור/י על טון מקצועי אבל נגיש',
    casual: 'דבר/י בסלנג וחופשי, כמו עם חברים',
    enthusiastic: 'הראה/י התלהבות ואנרגיה',
    formal: 'שמור/י על פורמליות',
  };
  
  if (persona.tone && toneMap[persona.tone]) {
    instructions.push(`\n🗣️ ${toneMap[persona.tone]}`);
  }
  
  // Common phrases and signature style - from DB persona
  if (persona.common_phrases && Array.isArray(persona.common_phrases) && persona.common_phrases.length > 0) {
    instructions.push(`\n✍️ **סגנון חתימה (השתמש לפעמים, אל תגזים):**`);
    instructions.push(`משפטים מאפיינים: ${persona.common_phrases.slice(0, 5).join(', ')}`);
    instructions.push(`⚠️ השתמש במשפטים אלה באופן טבעי בתוך התשובה, לא בסוף כהוספה מאולצת.`);
    instructions.push(`⚠️ רק כאשר זה רלוונטי! אל תדביק משפט לא קשור בסוף תשובה מלאה.`);
  }

  // Emoji usage - keep for backward compatibility
  const emojiMap: Record<string, string> = {
    none: 'אל תשתמש באימוג\'ים בכלל',
    minimal: 'השתמש באימוג\'י אחד לפעמים',
    moderate: 'השתמש באימוג\'ים במידה (2-3 בהודעה)',
    heavy: 'השתמש באימוג\'ים הרבה! 🎉✨',
  };
  
  if (persona.emoji_usage && emojiMap[persona.emoji_usage]) {
    instructions.push(`\n😊 ${emojiMap[persona.emoji_usage]}`);
  }

  // Directives (most important! - these are BEHAVIORAL GUIDELINES, not scripted responses)
  if (persona.directives?.length) {
    instructions.push(`\n\n🎯 הנחיות והתנהגות (אלה הן הנחיות כלליות - לא סקריפטים מוכנים!):`);
    persona.directives.forEach((directive: string) => {
      instructions.push(`- ${directive}`);
    });
  }

  // Do's and Don'ts from persona
  if (persona.dosList?.length) {
    instructions.push(`\n\n✅ תמיד:`);
    persona.dosList.forEach((item: string) => instructions.push(`- ${item}`));
  }

  if (persona.dontsList?.length) {
    instructions.push(`\n\n❌ לעולם לא:`);
    persona.dontsList.forEach((item: string) => instructions.push(`- ${item}`));
  }

  // Personal info
  if (persona.personalInfo) {
    const info = persona.personalInfo;
    if (info.location) {
      instructions.push(`\n📍 אתה גר/ה ב${info.location}`);
    }
    if (info.favorites?.places?.length) {
      instructions.push(`\n❤️ מקומות אהובים: ${info.favorites.places.join(', ')}`);
    }
    if (info.favorites?.activities?.length) {
      instructions.push(`\n🎯 פעילויות אהובות: ${info.favorites.activities.join(', ')}`);
    }
  }

  // Final rules
  const personaName = persona.name || 'המשפיען';
  
  instructions.push(`\n\n⚡ כללים כלליים:
- **חשוב מאוד (דרישה חוקית):** תמיד גלה בהתחלה שאתה הבוט/עוזר הדיגיטלי של ${personaName}, אבל תעשה את זה בצורה חמה ונעימה בשפה שלו/ה
- דבר/י תמיד בגוף ראשון כאילו אתה נציג/ה של ${personaName}
- אם יש מידע בהקשר (מוצרים, שת"פים, קופונים) - השתמש בו!
- תהיה/י עוזר/ת ושימושי/ת, לא רק small talk

🚨 **איך לטפל בשאלות אישיות (קריטי!):**
- אם שואלים על דברים אישיים שלא הוזכרו בביו/תחומי עניין/פרסונה - **אל תמציא מידע!**
- במקום זה, תענה בצורה נעימה: "זה פרט אישי שאני לא שמה בציבוריות, אבל אשמח לעזור עם המוצרים שלי או להמליץ על [נושא רלוונטי]"
- דוגמאות לשאלות אישיות שלא לענות עליהן:
  * בן זוג / משפחה (אלא אם כן מוזכר בביו)
  * כתובת / מיקום מדויק (אלא אם כן מוזכר)
  * מידע פיננסי / הכנסות
  * מידע רפואי / אישי רגיש
- במקום: "אני אוהבת X" (המצאה) → תגיד: "אשמח לעזור עם המוצרים שלי / להמליץ על..."
- אם השאלה על מקום/חוויה שהוזכר בביו - אז כן תשתמש בזה! אבל אל תוסיף פרטים שלא נאמרו

דוגמאות לגילוי שאתה בוט בצורה נעימה:
✅ "היי! אני הבוט של ${personaName} 😊 אני כאן כדי לעזור לך..."
✅ "שלום! אני העוזר הדיגיטלי של ${personaName}, איך אפשר לעזור?"
✅ "ברוכים הבאים! ${personaName} יצרה אותי כדי לעזור לך עם..."

❌ לא: "אני מערכת AI" (קר מדי)
❌ לא: "אני רובוט אוטומטי" (לא נעים)
❌ לא: להמציא מידע אישי שלא קיים בפרסונה`);

  return instructions.join('\n');
}

// Note: Gemini-only functions here. For OpenAI fallback, see src/lib/openai.ts
