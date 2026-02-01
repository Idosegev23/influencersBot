import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

// Models configuration
export const GEMINI_MODELS = {
  PERSONA_BUILDER: 'gemini-3-pro-preview',      // For building persona (quality, depth)
  CHAT_RESPONSES: 'gemini-3-flash-preview',     // For real-time chat (speed, cost)
  ANALYSIS: 'gemini-3-flash-preview',           // For quick analysis
} as const;

/**
 * Build persona using Gemini 3 Pro
 * High quality, runs once when creating/updating persona
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
  const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.PERSONA_BUILDER });

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

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  // Parse JSON response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse persona JSON');
  }

  return JSON.parse(jsonMatch[0]);
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

  // Start chat
  const chat = model.startChat({
    history,
    systemInstruction: systemInstructions,
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
 * Build system instructions from persona
 */
function buildSystemInstructions(persona: any): string {
  const instructions = [];

  // Base identity
  instructions.push(`אתה ${persona.name || 'המשפיען/ית'}.`);
  
  // Voice and tone
  if (persona.voice_and_tone || persona.voiceAndTone) {
    instructions.push(`\n🎭 סגנון דיבור:\n${persona.voice_and_tone || persona.voiceAndTone}`);
  }

  // Bio
  if (persona.bio) {
    instructions.push(`\n👤 עליך:\n${persona.bio}`);
  }

  // Interests
  if (persona.interests?.length) {
    instructions.push(`\n❤️ תחומי עניין: ${persona.interests.join(', ')}`);
  }

  // Tone setting
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

  // Emoji usage
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
  instructions.push(`\n\n⚡ כללים כלליים:
- **חשוב מאוד (דרישה חוקית):** תמיד גלה בהתחלה שאתה הבוט/עוזר הדיגיטלי של ${persona.name || 'המשפיען'}, אבל תעשה את זה בצורה חמה ונעימה בשפה שלו/ה
- דבר/י תמיד בגוף ראשון כאילו אתה נציג/ה של ${persona.name}
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
✅ "היי! אני הבוט של ${persona.name || 'המשפיען'} 😊 אני כאן כדי לעזור לך..."
✅ "שלום! אני העוזר הדיגיטלי של ${persona.name || 'המשפיען'}, איך אפשר לעזור?"
✅ "ברוכים הבאים! ${persona.name || 'המשפיען'} יצרה אותי כדי לעזור לך עם..."

❌ לא: "אני מערכת AI" (קר מדי)
❌ לא: "אני רובוט אוטומטי" (לא נעים)
❌ לא: להמציא מידע אישי שלא קיים בפרסונה`);

  return instructions.join('\n');
}

// Note: Gemini-only functions here. For OpenAI fallback, see src/lib/openai.ts
