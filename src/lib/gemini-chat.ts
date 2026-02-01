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
  recentPosts: string[];
  customDirectives?: string[];
}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.PERSONA_BUILDER });

  const prompt = `אתה מומחה בבניית פרסונות אותנטיות למשפיענים.

תפקידך: ליצור פרסונה עמוקה ואותנטית עבור ${input.username} שתשמש את הצ'אטבוט שלה/שלו.

📊 נתונים:
Bio: ${input.bio}
תחומי עניין: ${input.interests.join(', ')}

תוכן אחרון:
${input.recentPosts.slice(0, 10).join('\n---\n')}

${input.customDirectives?.length ? `\n🎯 הנחיות מיוחדות מהמשפיען:\n${input.customDirectives.join('\n')}` : ''}

בנה פרסונה מפורטת בפורמט JSON עם השדות הבאים:

{
  "voiceAndTone": "איך המשפיען/ית מדבר/ת (גוף ראשון, סגנון, אישיות)",
  "knowledgeAreas": ["תחום 1", "תחום 2", "..."],
  "conversationStyle": "תיאור של איך לנהל שיחה (חם/פורמלי/הומוריסטי וכו')",
  "dosList": ["תמיד עשה X", "תמיד דבר בגוף ראשון", "..."],
  "dontsList": ["אל תעמיד פנים שאתה AI", "אל תדבר על נושאים אישיים שלא צוינו", "..."],
  "personalInfo": {
    "location": "מיקום אם צוין",
    "hobbies": ["תחביב 1", "..."],
    "favorites": {
      "places": ["..."],
      "activities": ["..."]
    }
  },
  "responseExamples": {
    "greeting": "דוגמה לברכה",
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

  // Directives (most important!)
  if (persona.directives?.length) {
    instructions.push(`\n\n🎯 חוקים חשובים (תמיד עקוב!):`);
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

  // Custom responses
  if (persona.custom_responses && Object.keys(persona.custom_responses).length > 0) {
    instructions.push(`\n\n📝 תשובות מוכנות לנושאים ספציפיים:`);
    Object.entries(persona.custom_responses).forEach(([topic, response]) => {
      instructions.push(`- כש${topic}: ${response}`);
    });
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
- דבר/י תמיד בגוף ראשון כאילו אתה ${persona.name}
- אם שואלים על דברים אישיים שלא ציינת - תהיה/י מעורפל/ת בנימוס
- אל תגיד "אני בוט" או "אני AI" - אתה ${persona.name}!
- אם יש מידע בהקשר (מוצרים, שת"פים, קופונים) - השתמש בו!
- תהיה/י עוזר/ת ושימושי/ת, לא רק small talk`);

  return instructions.join('\n');
}

/**
 * Export for backward compatibility
 */
export async function chat(
  messages: Array<{ role: string; content: string }>,
  options?: { model?: string; temperature?: number }
) {
  // This is the old OpenAI function - we'll keep it for now
  const client = getClient();
  
  const completion = await client.chat.completions.create({
    model: options?.model || CHAT_MODEL,
    messages: messages as any,
    temperature: options?.temperature || 0.7,
    max_tokens: 500,
  });

  return completion.choices[0]?.message?.content || 'מצטער, לא הצלחתי להבין';
}

export { buildInfluencerInstructions } from './chatbot/instructions-builder';
