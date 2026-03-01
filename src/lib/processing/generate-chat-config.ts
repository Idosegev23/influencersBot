/**
 * Auto-generate chat page configuration from persona data
 * Called after persona building to customize the chat UI per influencer
 */

import { createClient } from '@/lib/supabase/server';
import { themePresets } from '@/lib/theme';
import type { InfluencerType } from '@/types';

// ============================================
// Type Detection from Persona
// ============================================

const TYPE_KEYWORDS: Record<InfluencerType, string[]> = {
  beauty: ['ביוטי', 'טיפוח', 'איפור', 'עור', 'שיער', 'סקינקייר', 'skincare', 'makeup', 'beauty', 'cosmetics', 'קוסמטיקה'],
  fashion: ['אופנה', 'סטייל', 'לוק', 'fashion', 'style', 'outfit', 'בגדים', 'מעצב'],
  food: ['אוכל', 'בישול', 'מתכון', 'מטבח', 'food', 'cooking', 'recipe', 'שף', 'אפייה'],
  fitness: ['כושר', 'ספורט', 'אימון', 'בריאות', 'fitness', 'workout', 'gym', 'תזונה'],
  tech: ['טכנולוגיה', 'tech', 'גאדג\'ט', 'אפליקציה', 'תוכנה', 'סטארטאפ'],
  lifestyle: ['לייפסטייל', 'lifestyle', 'חיים', 'שגרה', 'יומיום'],
  parenting: ['אמהות', 'הורות', 'ילדים', 'תינוק', 'parenting', 'mom', 'משפחה'],
  travel: ['טיולים', 'טיול', 'travel', 'מסע', 'יעד', 'חופשה', 'vacation'],
  other: [],
};

function detectInfluencerType(personaName: string, coreTopics: any[]): InfluencerType {
  const allText = [
    personaName,
    ...coreTopics.map((t: any) => `${t.name} ${(t.subtopics || []).join(' ')}`),
  ].join(' ').toLowerCase();

  const scores: Record<string, number> = {};

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === 'other') continue;
    scores[type] = keywords.reduce((score, kw) => {
      const regex = new RegExp(kw, 'gi');
      const matches = allText.match(regex);
      return score + (matches ? matches.length : 0);
    }, 0);
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  return (sorted[0]?.[1] > 0 ? sorted[0][0] : 'other') as InfluencerType;
}

// ============================================
// Generate Greeting & Questions from Persona
// ============================================

function generateGreeting(displayName: string, personaIdentity: any): string {
  const firstName = displayName.split(' ')[0];

  if (personaIdentity?.who) {
    // Extract key info from identity
    const who = personaIdentity.who;
    // Keep it short and warm
    if (who.length > 50) {
      return `היי! אני העוזרת הדיגיטלית של ${firstName} 💕 שאלו אותי הכל על התוכן, המוצרים וההמלצות!`;
    }
  }

  return `היי! אני העוזרת הדיגיטלית של ${firstName} 💕 אני כאן לעזור עם המלצות, קופונים וטיפים!`;
}

function generateSuggestedQuestions(coreTopics: any[], influencerType: InfluencerType): string[] {
  const questions: string[] = [];

  // Generate questions from core topics
  for (const topic of coreTopics.slice(0, 3)) {
    const name = topic.name || '';
    // Create a natural question from the topic name
    if (name.includes('טיפוח') || name.includes('עור') || name.includes('skincare')) {
      questions.push('מה השגרת טיפוח שלך? ✨');
    } else if (name.includes('שיער')) {
      questions.push('איזה מוצרי שיער את ממליצה? 💇‍♀️');
    } else if (name.includes('איפור') || name.includes('cosmetics')) {
      questions.push('מה המוצר הכי שווה מהמותג שלך? 💄');
    } else if (name.includes('בישום') || name.includes('בושם')) {
      questions.push('איזה בושם הכי מומלץ? 🌸');
    } else if (name.includes('אוכל') || name.includes('מתכון') || name.includes('בישול')) {
      questions.push('יש מתכון מהיר וטעים? 🍽️');
    } else if (name.includes('אופנה') || name.includes('fashion')) {
      questions.push('מה הטרנד הכי חם עכשיו? 👗');
    } else if (name.includes('כושר') || name.includes('אימון')) {
      questions.push('איזה אימון את ממליצה למתחילים? 💪');
    } else if (name.includes('טיול') || name.includes('travel')) {
      questions.push('מה היעד הכי מומלץ? ✈️');
    } else if (name.includes('הורות') || name.includes('ילדים') || name.includes('אמהות')) {
      questions.push('יש טיפ להורים? 👶');
    } else if (name.includes('חתונה') || name.includes('bride')) {
      questions.push('ספרי על ההכנות לחתונה! 💍');
    } else {
      // Generic question from topic name
      const shortName = name.split('(')[0].trim();
      if (shortName.length < 30) {
        questions.push(`ספרי על ${shortName} 📌`);
      }
    }
  }

  // Add generic useful questions if not enough
  if (questions.length < 3) {
    const genericByType: Record<string, string[]> = {
      beauty: ['מה הקופון הכי שווה? 💸', 'איזה מוצר חובה? ✨', 'מה השגרה היומית שלך? 🌟'],
      fashion: ['מה הטרנד הכי חם? 👗', 'איפה כדאי לקנות? 🛍️', 'יש קופון הנחה? 💸'],
      food: ['מה המתכון הכי פופולרי? 🍽️', 'יש קופון הנחה? 💸', 'מה ההמלצה לארוחה מהירה? ⚡'],
      fitness: ['מה התוכנית המומלצת? 💪', 'יש טיפ תזונה? 🥗', 'מה האימון הכי אפקטיבי? 🔥'],
      lifestyle: ['מה ההמלצה הכי חמה? ✨', 'יש קופון? 💸', 'מה חדש? 🆕'],
      parenting: ['יש טיפ להורים? 👶', 'מה המוצר הכי שווה? 🛍️', 'מה ההמלצה שלך? 💕'],
      travel: ['מה היעד הכי מומלץ? ✈️', 'טיפים לטיול? 🗺️', 'איפה כדאי לישון? 🏨'],
      tech: ['מה הגאדג\'ט הכי שווה? 📱', 'יש המלצה לאפליקציה? 💡', 'מה חדש בתחום? 🆕'],
      other: ['מה ההמלצה הכי חמה? ✨', 'יש קופון? 💸', 'ספרי עוד! 📌'],
    };

    const defaults = genericByType[influencerType] || genericByType.other;
    for (const q of defaults) {
      if (questions.length >= 3) break;
      if (!questions.includes(q)) questions.push(q);
    }
  }

  return questions.slice(0, 3);
}

// ============================================
// Main Function: Generate & Save Config
// ============================================

export async function generateAndSaveChatConfig(accountId: string): Promise<{
  influencerType: InfluencerType;
  greeting: string;
  questions: string[];
}> {
  const supabase = await createClient();

  // Load persona data
  const { data: persona, error: personaError } = await supabase
    .from('chatbot_persona')
    .select('name, knowledge_map, voice_rules, instagram_username')
    .eq('account_id', accountId)
    .single();

  if (personaError || !persona) {
    throw new Error(`Persona not found for account ${accountId}`);
  }

  // Load current account config
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  if (accountError || !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const coreTopics = persona.knowledge_map?.coreTopics || [];
  const identity = persona.knowledge_map?.identity || persona.voice_rules?.identity;
  const displayName = persona.name || account.config?.display_name || persona.instagram_username;

  // Detect influencer type
  const influencerType = detectInfluencerType(displayName, coreTopics);

  // Get theme preset
  const theme = themePresets[influencerType] || themePresets.other;

  // Generate greeting & questions
  const greeting = generateGreeting(displayName, identity);
  const questions = generateSuggestedQuestions(coreTopics, influencerType);

  // Build updated config
  const updatedConfig = {
    ...account.config,
    influencer_type: influencerType,
    theme,
    greeting_message: greeting,
    suggested_questions: questions,
  };

  // Save to accounts
  const { error: updateError } = await supabase
    .from('accounts')
    .update({ config: updatedConfig })
    .eq('id', accountId);

  if (updateError) {
    throw new Error(`Failed to update config: ${updateError.message}`);
  }

  console.log(`[Chat Config] ✅ Updated config for ${displayName}:`);
  console.log(`  - Type: ${influencerType}`);
  console.log(`  - Theme: ${theme.style} (${theme.colors.primary})`);
  console.log(`  - Greeting: ${greeting.substring(0, 60)}...`);
  console.log(`  - Questions: ${questions.length}`);

  return { influencerType, greeting, questions };
}
