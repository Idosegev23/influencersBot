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
  beauty: ['ביוטי', 'טיפוח', 'איפור', 'עור', 'שיער', 'סקינקייר', 'סקין-קייר', 'skincare', 'makeup', 'beauty', 'cosmetics', 'קוסמטיקה', 'קוסמטי', 'רכיבים', 'קרם', 'סרום'],
  fashion: ['אופנה', 'סטייל', 'לוק', 'fashion', 'style', 'outfit', 'בגדים', 'מעצב', 'designer'],
  food: ['אוכל', 'בישול', 'מתכון', 'מטבח', 'food', 'cooking', 'recipe', 'שף', 'אפייה', 'תבלינים', 'תבלין', 'spice', 'kitchen', 'מתכונים'],
  fitness: ['כושר', 'ספורט', 'אימון', 'בריאות', 'fitness', 'workout', 'gym', 'תזונה', 'יוגה'],
  tech: ['טכנולוגיה', 'tech', 'גאדג\'ט', 'אפליקציה', 'תוכנה', 'סטארטאפ', 'מדע', 'scientist', 'מהנדס', 'הנדסה', 'engineering', 'technology', 'מפתח', 'software', 'בינה מלאכותית'],
  lifestyle: ['לייפסטייל', 'לייף-סטייל', 'lifestyle', 'חיים', 'שגרה', 'יומיום', 'זוגיות'],
  parenting: ['אמהות', 'הורות', 'ילדים', 'תינוק', 'parenting', 'mom', 'משפחה', 'אמא'],
  travel: ['טיולים', 'טיול', 'travel', 'מסע', 'יעד', 'חופשה', 'vacation'],
  home: [],
  media_news: [],
  other: [],
};

/**
 * Gather ALL available text from persona for type detection.
 * Different GPT-5.2 Pro outputs use different field structures.
 */
function gatherPersonaText(persona: any, parsed: any, identity: any): string {
  const parts: string[] = [];

  // persona.name — often a long identity description with rich keywords
  if (persona.name) parts.push(persona.name);

  // coreTopics — may use 'name' or 'topic' field
  const coreTopics = parsed?.knowledgeMap?.coreTopics || persona.knowledge_map?.coreTopics || [];
  for (const t of coreTopics) {
    parts.push(t.name || t.topic || '');
    if (t.subtopics) parts.push(t.subtopics.join(' '));
    if (t.keyPoints) parts.push(t.keyPoints.join(' '));
    if (t.whatSheSaysOrShows) parts.push(t.whatSheSaysOrShows.join(' '));
  }

  // knownDomains — has 'domain' field
  const knownDomains = parsed?.knowledgeMap?.knownDomains || persona.knowledge_map?.knownDomains || [];
  for (const d of knownDomains) {
    parts.push(d.domain || '');
    if (d.whatIsKnown) parts.push(d.whatIsKnown.join(' '));
  }

  // identity.category (e.g., "Kitchen/cooking", "Science, Technology & Engineering")
  if (parsed?.identity?.category) parts.push(parsed.identity.category);
  if (identity?.who) parts.push(typeof identity.who === 'string' ? identity.who : '');

  // selfDescriptionFromBio
  const bio = parsed?.identity?.selfDescriptionFromBio;
  if (Array.isArray(bio)) parts.push(bio.join(' '));

  // rolesObservedInContent
  const roles = parsed?.identity?.rolesObservedInContent;
  if (Array.isArray(roles)) parts.push(roles.join(' '));

  return parts.join(' ');
}

function detectInfluencerTypes(personaText: string): { primary: InfluencerType; all: InfluencerType[] } {
  const allText = personaText.toLowerCase();

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
  const primary = (sorted[0]?.[1] > 0 ? sorted[0][0] : 'other') as InfluencerType;
  const all = sorted.filter(([, score]) => score > 0).map(([type]) => type as InfluencerType);
  return { primary, all: all.length > 0 ? all : ['other' as InfluencerType] };
}

// ============================================
// Generate Greeting & Questions from Persona
// ============================================

/**
 * Extract a clean display name. Profile full_name is preferred over persona.name
 * (which is often a long identity description).
 */
function extractCleanDisplayName(profileFullName: string | null | undefined, personaName: string | null | undefined, fallback: string): string {
  if (profileFullName) {
    const parts = profileFullName.split(/\s*[\|–\-]\s*/);
    const hebrewPart = parts.find(p => /[\u0590-\u05FF]/.test(p))?.trim();
    if (hebrewPart && hebrewPart.length > 1 && hebrewPart.length < 50) return hebrewPart;
    if (profileFullName.length < 50) return profileFullName;
  }
  if (personaName) {
    const nameMatch = personaName.match(/^([^\(,–\-]{2,30})/);
    if (nameMatch) {
      const candidate = nameMatch[1].trim();
      if (candidate.length < 30 && !candidate.includes('לא ') && !candidate.includes('יוצר')) return candidate;
    }
  }
  return fallback;
}

function generateGreeting(displayName: string, personaIdentity: any): string {
  const firstName = displayName.split(' ')[0];

  if (personaIdentity?.who) {
    // Extract a short description from identity
    const who = typeof personaIdentity.who === 'string' ? personaIdentity.who : '';
    if (who.length > 20) {
      // Use the persona identity for a more personalized greeting
      const shortWho = who.substring(0, 80).replace(/[.,;:!]+$/, '');
      return `היי! אני הבוט של ${firstName} 💕 ${shortWho}. שאלו אותי הכל!`;
    }
  }

  return `היי! אני הבוט של ${firstName} 💕 אני כאן לעזור עם כל מה שקשור לתוכן, המוצרים וההמלצות!`;
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
      questions.push('איזה מוצרי שיער הכי מומלצים? 💇‍♀️');
    } else if (name.includes('איפור') || name.includes('cosmetics')) {
      questions.push('מה המוצר הכי שווה מהמותג שלך? 💄');
    } else if (name.includes('בישום') || name.includes('בושם')) {
      questions.push('איזה בושם הכי מומלץ? 🌸');
    } else if (name.includes('אוכל') || name.includes('מתכון') || name.includes('בישול')) {
      questions.push('יש מתכון מהיר וטעים? 🍽️');
    } else if (name.includes('אופנה') || name.includes('fashion')) {
      questions.push('מה הטרנד הכי חם עכשיו? 👗');
    } else if (name.includes('כושר') || name.includes('אימון')) {
      questions.push('איזה אימון מומלץ למתחילים? 💪');
    } else if (name.includes('טיול') || name.includes('travel')) {
      questions.push('מה היעד הכי מומלץ? ✈️');
    } else if (name.includes('הורות') || name.includes('ילדים') || name.includes('אמהות')) {
      questions.push('יש טיפ להורים? 👶');
    } else if (name.includes('חתונה') || name.includes('bride')) {
      questions.push('ספר/י על ההכנות לחתונה! 💍');
    } else {
      // Generic question from topic name
      const shortName = name.split('(')[0].trim();
      if (shortName.length < 30) {
        questions.push(`ספר/י על ${shortName} 📌`);
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
      other: ['מה ההמלצה הכי חמה? ✨', 'יש קופון? 💸', 'ספר/י עוד! 📌'],
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

  // Load persona data (include gemini_raw_output for richer type detection)
  const { data: persona, error: personaError } = await supabase
    .from('chatbot_persona')
    .select('name, knowledge_map, voice_rules, instagram_username, gemini_raw_output')
    .eq('account_id', accountId)
    .single();

  if (personaError || !persona) {
    throw new Error(`Persona not found for account ${accountId}`);
  }

  // Load current account config + latest profile pic
  const [accountRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('config').eq('id', accountId).single(),
    supabase.from('instagram_profile_history')
      .select('profile_pic_url, full_name')
      .eq('account_id', accountId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (accountRes.error || !accountRes.data) {
    throw new Error(`Account not found: ${accountId}`);
  }
  const account = accountRes.data;
  const latestProfile = profileRes.data;

  const parsed = (persona as any).gemini_raw_output?.parsed || (persona as any).gemini_raw_output;
  const coreTopics = parsed?.knowledgeMap?.coreTopics || persona.knowledge_map?.coreTopics || [];
  const identity = parsed?.identity || persona.knowledge_map?.identity || persona.voice_rules?.identity;
  const displayName = extractCleanDisplayName(latestProfile?.full_name, persona.name, account.config?.display_name || persona.instagram_username || 'Unknown');

  // Detect influencer type(s) — gather ALL available text for keyword matching
  const personaText = gatherPersonaText(persona, parsed, identity);
  const { primary: influencerType, all: influencerTypes } = detectInfluencerTypes(personaText);

  // Get theme preset (based on primary type)
  const theme = themePresets[influencerType] || themePresets.other;

  // Generate greeting & questions
  const greeting = generateGreeting(displayName, identity);
  const questions = generateSuggestedQuestions(coreTopics, influencerType);

  // Build updated config — include avatar from profile if not already set
  const avatarUrl = account.config?.avatar_url || latestProfile?.profile_pic_url || null;
  const updatedConfig = {
    ...account.config,
    influencer_type: influencerType,
    influencer_types: influencerTypes,
    theme,
    greeting_message: greeting,
    suggested_questions: questions,
    display_name: displayName,
    ...(avatarUrl && !account.config?.avatar_url ? { avatar_url: avatarUrl } : {}),
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
  console.log(`  - Types: ${influencerTypes.join(', ')} (primary: ${influencerType})`);
  console.log(`  - Theme: ${theme.style} (${theme.colors.primary})`);
  console.log(`  - Greeting: ${greeting.substring(0, 60)}...`);
  console.log(`  - Questions: ${questions.length}`);

  return { influencerType, greeting, questions };
}
