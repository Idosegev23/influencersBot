import { getGeminiClient, MODELS } from '@/lib/ai/google-client';

// Models configuration
export const AI_MODELS = {
  PERSONA_BUILDER: MODELS.COMPLEX,
  CHAT_RESPONSES: MODELS.CHAT_FAST,
  ANALYSIS: MODELS.CHAT_FAST,
} as const;

/**
 * Build persona using Gemini Pro with deep analysis
 * Runs once when creating/updating persona
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
  console.log(`[Gemini Pro] Building DEEP persona for @${input.username}...`);

  const prompt = `אתה מומחה בבניית פרסונות אותנטיות למשפיענים.

תפקידך: ליצור פרסונה עמוקה ואותנטית עבור ${input.username} שתשמש את הצ'אטבוט שלה/שלו.

נתוני פרופיל:
Bio: ${input.bio}
תחומי עניין מזוהים: ${input.interests.join(', ')}

${input.analytics ? `
ניתוח מעמיק של התוכן:
- סגנון כתיבה: ${input.analytics.contentAnalysis.writingStyle}
- אורך ממוצע: ${input.analytics.contentAnalysis.avgCaptionLength} תווים (${input.analytics.contentAnalysis.avgWordsPerPost} מילים)
- צפיפות אימוג'ים: ${input.analytics.contentAnalysis.emojiDensity}%
- שימוש בשאלות: ${input.analytics.contentAnalysis.questionFrequency}% מהפוסטים
- סוגי תוכן: ${JSON.stringify(input.analytics.contentAnalysis.contentTypeDistribution)}

דפוסי אנגייג'מנט:
- ממוצע לייקים: ${input.analytics.engagementPatterns.avgLikes}
- ממוצע תגובות: ${input.analytics.engagementPatterns.avgComments}
- סוג תוכן מעניין ביותר: ${input.analytics.engagementPatterns.mostEngagingType}
- טרנד אנגייג'מנט: ${input.analytics.engagementPatterns.engagementTrend}

התנהגות פרסום:
- שעות פעילות: ${input.analytics.postingBehavior.mostActiveHours?.join(', ')}
- ימים פעילים: ${input.analytics.postingBehavior.mostActiveDays?.join(', ')}
- תדירות: ${input.analytics.postingBehavior.postingFrequency}

פוסטים ויראליים (TOP 5):
${input.analytics.topPerformingPosts?.map((p, i) => `${i + 1}. [${p.engagement_rate} engagement] ${p.caption.substring(0, 150)}...`).join('\n')}
` : ''}

פוסטים לדוגמה (${input.enrichedPosts?.length || 0} אחרונים):
${input.enrichedPosts?.slice(0, 10).map((post, i) => `
${i + 1}. [${post.type}] [Engagement: ${post.engagement.rate}%]
${post.caption.substring(0, 300)}${post.caption.length > 300 ? '...' : ''}
`).join('\n---\n') || 'אין פוסטים זמינים'}

${input.customDirectives?.length ? `\nהנחיות מיוחדות מהמשפיען:\n${input.customDirectives.join('\n')}` : ''}

בנה פרסונה מפורטת בפורמט JSON עם השדות הבאים:

{
  "voiceAndTone": "איך המשפיען/ית מדבר/ת",
  "knowledgeAreas": ["תחום 1", "תחום 2"],
  "conversationStyle": "תיאור מפורט",
  "contentPreferences": {
    "preferredFormats": ["Image/Video/Reel"],
    "writingStyle": "תמציתי/בינוני/מפורט",
    "emojiUsage": "heavy/moderate/minimal/none",
    "postingTimes": ["שעות"]
  },
  "dosList": ["כלל 1"],
  "dontsList": ["כלל 1"],
  "personalInfo": {
    "location": "מיקום",
    "hobbies": ["תחביב"],
    "favorites": {
      "places": [],
      "activities": [],
      "topics": []
    }
  },
  "viralContentInsights": "תובנות",
  "responseExamples": {
    "greeting": "דוגמה לברכה",
    "productQuestion": "דוגמה",
    "personalQuestion": "דוגמה"
  }
}`;

  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: AI_MODELS.PERSONA_BUILDER,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    });

    const persona = JSON.parse(response.text || '{}');

    console.log('[Gemini Pro] Persona built successfully!');

    return persona;

  } catch (error) {
    console.error('[Gemini Pro] Failed to build persona:', error);
    throw error;
  }
}

/**
 * Chat with Gemini Flash (fast responses)
 */
export async function chatWithGemini(input: {
  message: string;
  persona: any;
  context: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; text: string }>;
}) {
  const client = getGeminiClient();

  const systemInstructions = buildSystemInstructions(input.persona);

  const contents = [
    ...(input.conversationHistory?.map(msg => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.text }],
    })) || []),
    {
      role: 'user' as const,
      parts: [{ text: `${input.context ? `\n\n[הקשר זמין:\n${input.context}\n]\n\n` : ''}${input.message}` }],
    },
  ];

  const response = await client.models.generateContent({
    model: AI_MODELS.CHAT_RESPONSES,
    contents,
    config: {
      systemInstruction: systemInstructions,
    },
  });

  return {
    text: response.text || '',
    usage: {
      promptTokens: (response as any).usageMetadata?.promptTokenCount || 0,
      completionTokens: (response as any).usageMetadata?.candidatesTokenCount || 0,
      totalTokens: (response as any).usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Stream chat with Gemini Flash (for real-time responses)
 */
export async function streamChatWithGemini(input: {
  message: string;
  persona: any;
  context: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; text: string }>;
  onDelta: (text: string) => void;
}) {
  const client = getGeminiClient();

  const systemInstructions = buildSystemInstructions(input.persona);

  const contents = [
    ...(input.conversationHistory?.map(msg => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.text }],
    })) || []),
    {
      role: 'user' as const,
      parts: [{ text: `${input.context ? `\n\n[הקשר זמין:\n${input.context}\n]\n\n` : ''}${input.message}` }],
    },
  ];

  const response = await client.models.generateContentStream({
    model: AI_MODELS.CHAT_RESPONSES,
    contents,
    config: {
      systemInstruction: systemInstructions,
    },
  });

  let fullText = '';

  for await (const chunk of response) {
    const chunkText = chunk.text || '';
    fullText += chunkText;
    input.onDelta(chunkText);
  }

  return {
    text: fullText,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };
}

/**
 * Build system instructions from persona
 */
function buildSystemInstructions(persona: any): string {
  const instructions = [];

  if (persona.voice_rules?.identity?.who) {
    instructions.push(`אתה ${persona.voice_rules.identity.who}`);
  } else {
    instructions.push(`אתה ${persona.name || 'המשפיען/ית'}.`);
  }

  if (persona.voice_rules) {
    instructions.push(`\nסגנון דיבור ותשובה:`);
    instructions.push(`- טון: ${persona.voice_rules.tone}`);
    instructions.push(`- מבנה תשובה: ${persona.voice_rules.responseStructure}`);
    instructions.push(`- אורך ממוצע: ${persona.voice_rules.avgLength}`);

    if (persona.voice_rules.recurringPhrases?.length > 0) {
      instructions.push(`- ביטויים מאפיינים: ${persona.voice_rules.recurringPhrases.slice(0, 5).join(', ')}`);
    }

    if (persona.voice_rules.avoidedWords?.length > 0) {
      instructions.push(`- מילים להימנע מהן: ${persona.voice_rules.avoidedWords.slice(0, 5).join(', ')}`);
    }
  } else if (persona.voice_and_tone || persona.voiceAndTone) {
    instructions.push(`\nסגנון דיבור:\n${persona.voice_and_tone || persona.voiceAndTone}`);
  }

  if (persona.bio) {
    instructions.push(`\nעליך:\n${persona.bio}`);
  }

  if (persona.knowledge_map?.coreTopics?.length > 0) {
    instructions.push(`\nמפת הידע שלך (מבוסס על תוכן אמיתי):`);
    persona.knowledge_map.coreTopics.forEach((topic: any) => {
      instructions.push(`\n- ${topic.name}:`);
      if (topic.keyPoints?.length > 0) {
        topic.keyPoints.slice(0, 3).forEach((point: string) => {
          instructions.push(`  * ${point}`);
        });
      }
    });
  } else if (persona.interests?.length) {
    instructions.push(`\nתחומי עניין: ${persona.interests.join(', ')}`);
  }

  if (persona.boundaries) {
    instructions.push(`\nגבולות הידע:`);
    if (persona.boundaries.discussed?.length > 0) {
      instructions.push(`- נושאים שדיברת עליהם: ${persona.boundaries.discussed.slice(0, 10).join(', ')}`);
    }
    if (persona.boundaries.notDiscussed?.length > 0) {
      instructions.push(`- נושאים שלא דיברת עליהם: ${persona.boundaries.notDiscussed.slice(0, 5).join(', ')}`);
      instructions.push(`  אם נשאלת על אחד מהם, תגיד בנימוס שאין לך מספיק מידע על זה`);
    }
  }

  if (persona.response_policy) {
    instructions.push(`\nמדיניות תשובה:`);
    if (persona.response_policy.highConfidence?.length > 0) {
      instructions.push(`- ענה בביטחון על: ${persona.response_policy.highConfidence.slice(0, 3).join(', ')}`);
    }
    if (persona.response_policy.cautious?.length > 0) {
      instructions.push(`- ענה בזהירות על: ${persona.response_policy.cautious.slice(0, 3).join(', ')}`);
    }
    if (persona.response_policy.refuse?.length > 0) {
      instructions.push(`- סרב לענות על: ${persona.response_policy.refuse.slice(0, 3).join(', ')}`);
    }
  }

  const toneMap: Record<string, string> = {
    friendly: 'דבר/י בצורה חמה וידידותית',
    professional: 'שמור/י על טון מקצועי אבל נגיש',
    casual: 'דבר/י בסלנג וחופשי, כמו עם חברים',
    enthusiastic: 'הראה/י התלהבות ואנרגיה',
    formal: 'שמור/י על פורמליות',
  };

  if (persona.tone && toneMap[persona.tone]) {
    instructions.push(`\n${toneMap[persona.tone]}`);
  }

  if (persona.common_phrases && Array.isArray(persona.common_phrases) && persona.common_phrases.length > 0) {
    instructions.push(`\n**סגנון חתימה (השתמש לפעמים, אל תגזים):**`);
    instructions.push(`משפטים מאפיינים: ${persona.common_phrases.slice(0, 5).join(', ')}`);
    instructions.push(`השתמש במשפטים אלה באופן טבעי בתוך התשובה, לא בסוף כהוספה מאולצת.`);
  }

  const emojiMap: Record<string, string> = {
    none: 'אל תשתמש באימוג\'ים בכלל',
    minimal: 'השתמש באימוג\'י אחד לפעמים',
    moderate: 'השתמש באימוג\'ים במידה (2-3 בהודעה)',
    heavy: 'השתמש באימוג\'ים הרבה!',
  };

  if (persona.emoji_usage && emojiMap[persona.emoji_usage]) {
    instructions.push(`\n${emojiMap[persona.emoji_usage]}`);
  }

  if (persona.directives?.length) {
    instructions.push(`\n\nהנחיות והתנהגות:`);
    persona.directives.forEach((directive: string) => {
      instructions.push(`- ${directive}`);
    });
  }

  if (persona.dosList?.length) {
    instructions.push(`\n\nתמיד:`);
    persona.dosList.forEach((item: string) => instructions.push(`- ${item}`));
  }

  if (persona.dontsList?.length) {
    instructions.push(`\n\nלעולם לא:`);
    persona.dontsList.forEach((item: string) => instructions.push(`- ${item}`));
  }

  if (persona.personalInfo) {
    const info = persona.personalInfo;
    if (info.location) instructions.push(`\nאתה גר/ה ב${info.location}`);
    if (info.favorites?.places?.length) instructions.push(`\nמקומות אהובים: ${info.favorites.places.join(', ')}`);
    if (info.favorites?.activities?.length) instructions.push(`\nפעילויות אהובות: ${info.favorites.activities.join(', ')}`);
  }

  const personaName = persona.name || 'המשפיען';

  instructions.push(`\n\nכללים כלליים:
- **חשוב מאוד (דרישה חוקית):** תמיד גלה בהתחלה שאתה הבוט/עוזר הדיגיטלי של ${personaName}, אבל תעשה את זה בצורה חמה ונעימה בשפה שלו/ה
- דבר/י תמיד בגוף ראשון כאילו אתה נציג/ה של ${personaName}
- אם יש מידע בהקשר (מוצרים, שת"פים, קופונים) - השתמש בו!
- תהיה/י עוזר/ת ושימושי/ת, לא רק small talk

**איך לטפל בשאלות אישיות (קריטי!):**
- אם שואלים על דברים אישיים שלא הוזכרו - **אל תמציא מידע!**
- במקום זה, תענה בצורה נעימה
- אם השאלה על משהו שהוזכר בביו - אז כן תשתמש בזה`);

  return instructions.join('\n');
}
