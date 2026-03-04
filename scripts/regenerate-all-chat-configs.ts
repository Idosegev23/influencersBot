/**
 * Regenerate chat configs (greeting, theme, questions, avatar) for ALL accounts
 * Run with: npx tsx --tsconfig tsconfig.json scripts/regenerate-all-chat-configs.ts
 *
 * Requires .env.local with SUPABASE vars
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Inline the theme presets to avoid path alias issues
const themePresets: Record<string, any> = {
  beauty: { style: 'soft-glow', colors: { primary: '#D4A0A0', secondary: '#F5E6E0', accent: '#C27B7B', background: '#1a1216', surface: '#2a1f24', text: '#f5e6e0', textSecondary: '#c9a8a8', border: '#3d2a32' }, fonts: { heading: 'Playfair Display', body: 'Heebo' } },
  fashion: { style: 'editorial', colors: { primary: '#2C2C2C', secondary: '#E8E0D8', accent: '#D4AF37', background: '#0f0f0f', surface: '#1a1a1a', text: '#e8e0d8', textSecondary: '#a89f95', border: '#2c2c2c' }, fonts: { heading: 'Cormorant Garamond', body: 'Heebo' } },
  food: { style: 'warm-kitchen', colors: { primary: '#D4813B', secondary: '#FFF3E0', accent: '#8B4513', background: '#1a140e', surface: '#2a2118', text: '#fff3e0', textSecondary: '#c9a87c', border: '#3d2e1f' }, fonts: { heading: 'Amatic SC', body: 'Heebo' } },
  fitness: { style: 'energy', colors: { primary: '#00C853', secondary: '#E8F5E9', accent: '#FF6D00', background: '#0a1a0f', surface: '#152a1b', text: '#e8f5e9', textSecondary: '#81c784', border: '#1b3a22' }, fonts: { heading: 'Oswald', body: 'Heebo' } },
  tech: { style: 'minimal-tech', colors: { primary: '#6366F1', secondary: '#E0E7FF', accent: '#818CF8', background: '#0f1225', surface: '#1a1f3a', text: '#e0e7ff', textSecondary: '#818cf8', border: '#2a3055' }, fonts: { heading: 'Space Grotesk', body: 'Inter' } },
  lifestyle: { style: 'clean-modern', colors: { primary: '#64748B', secondary: '#F1F5F9', accent: '#0EA5E9', background: '#0f172a', surface: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155' }, fonts: { heading: 'Heebo', body: 'Inter' } },
  parenting: { style: 'playful', colors: { primary: '#F472B6', secondary: '#FFF1F2', accent: '#FB923C', background: '#1a0f14', surface: '#2a1a22', text: '#fff1f2', textSecondary: '#f9a8d4', border: '#3d2230' }, fonts: { heading: 'Varela Round', body: 'Heebo' } },
  travel: { style: 'wanderlust', colors: { primary: '#0EA5E9', secondary: '#E0F2FE', accent: '#F59E0B', background: '#0c1929', surface: '#162a3f', text: '#e0f2fe', textSecondary: '#7dd3fc', border: '#1e3a55' }, fonts: { heading: 'Caveat', body: 'Heebo' } },
  other: { style: 'default', colors: { primary: '#6366f1', secondary: '#e0e7ff', accent: '#ec4899', background: '#0f172a', surface: '#1e293b', text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155' }, fonts: { heading: 'Heebo', body: 'Inter' } },
};

const TYPE_KEYWORDS: Record<string, string[]> = {
  beauty: ['ביוטי', 'טיפוח', 'איפור', 'עור', 'שיער', 'סקינקייר', 'סקין-קייר', 'skincare', 'makeup', 'beauty', 'קוסמטיקה', 'קוסמטי', 'רכיבים', 'קרם', 'סרום'],
  fashion: ['אופנה', 'סטייל', 'לוק', 'fashion', 'style', 'outfit', 'בגדים', 'מעצב', 'designer'],
  food: ['אוכל', 'בישול', 'מתכון', 'מטבח', 'food', 'cooking', 'recipe', 'שף', 'אפייה', 'תבלינים', 'תבלין', 'spice', 'kitchen', 'מתכונים'],
  fitness: ['כושר', 'ספורט', 'אימון', 'בריאות', 'fitness', 'workout', 'gym', 'תזונה', 'יוגה'],
  tech: ['טכנולוגיה', 'tech', 'גאדג\'ט', 'אפליקציה', 'תוכנה', 'מדע', 'scientist', 'מהנדס', 'הנדסה', 'engineering', 'technology', 'מפתח', 'software', 'בינה מלאכותית'],
  lifestyle: ['לייפסטייל', 'לייף-סטייל', 'lifestyle', 'חיים', 'שגרה', 'יומיום', 'זוגיות'],
  parenting: ['אמהות', 'הורות', 'ילדים', 'תינוק', 'parenting', 'משפחה', 'אמא', 'mom'],
  travel: ['טיולים', 'טיול', 'travel', 'מסע', 'יעד', 'חופשה'],
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

  // selfDescriptionFromBio (array of strings in raw identity)
  const bio = parsed?.identity?.selfDescriptionFromBio;
  if (Array.isArray(bio)) parts.push(bio.join(' '));

  // rolesObservedInContent
  const roles = parsed?.identity?.rolesObservedInContent;
  if (Array.isArray(roles)) parts.push(roles.join(' '));

  return parts.join(' ');
}

function detectInfluencerTypes(personaText: string): { primary: string; all: string[] } {
  const allText = personaText.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    scores[type] = keywords.reduce((s, kw) => s + (allText.match(new RegExp(kw, 'gi'))?.length || 0), 0);
  }
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const primary = sorted[0]?.[1] > 0 ? sorted[0][0] : 'other';
  // All types with score > 0
  const all = sorted.filter(([, score]) => score > 0).map(([type]) => type);
  return { primary, all: all.length > 0 ? all : ['other'] };
}

/**
 * Extract a clean Hebrew display name from profile data.
 * Profile full_name often looks like: "Einav Booblil | עינב בובליל" or "Miran Buzaglo - מירן בוזגלו"
 * We prefer the Hebrew part if available.
 */
function extractCleanDisplayName(profileFullName: string | null, personaName: string | null, username: string | null): string {
  // First try profile_full_name — extract Hebrew part
  if (profileFullName) {
    // Check for separator patterns: " | ", " - ", " || "
    const parts = profileFullName.split(/\s*[\|–\-]\s*/);
    // Find the part with Hebrew characters
    const hebrewPart = parts.find(p => /[\u0590-\u05FF]/.test(p))?.trim();
    if (hebrewPart && hebrewPart.length > 1 && hebrewPart.length < 50) {
      return hebrewPart;
    }
    // If no Hebrew, use the whole thing (but cap it)
    if (profileFullName.length < 50) {
      return profileFullName;
    }
  }

  // Persona name is often a long description — try to extract just the name part
  if (personaName) {
    // If it starts with a name-like pattern (short words before comma/dash/parenthesis)
    const nameMatch = personaName.match(/^([^\(,–\-]{2,30})/);
    if (nameMatch) {
      const candidate = nameMatch[1].trim();
      // Only use if it looks like a name (not "לא הצלחנו" or "יוצרת תוכן")
      if (candidate.length < 30 && !candidate.includes('לא ') && !candidate.includes('יוצר')) {
        return candidate;
      }
    }
  }

  // Fallback to username
  return username || 'Unknown';
}

function generateGreeting(displayName: string, personaIdentity: any): string {
  const firstName = displayName.split(' ')[0];
  if (personaIdentity?.who) {
    const who = typeof personaIdentity.who === 'string' ? personaIdentity.who : '';
    if (who.length > 20) {
      const shortWho = who.substring(0, 80).replace(/[.,;:!]+$/, '');
      return `היי! אני הבוט של ${firstName} 💕 ${shortWho}. שאלו אותי הכל!`;
    }
  }
  return `היי! אני הבוט של ${firstName} 💕 אני כאן לעזור עם כל מה שקשור לתוכן, המוצרים וההמלצות!`;
}

async function main() {
  console.log('Regenerating chat configs for all accounts\n');

  // Get all active accounts with personas
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active')
    .order('created_at');

  if (error || !accounts) {
    console.error('Failed to fetch accounts:', error?.message);
    process.exit(1);
  }

  let success = 0;
  let skipped = 0;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const cfg = (acc.config || {}) as Record<string, any>;
    const name = cfg.display_name || cfg.username || acc.id;
    console.log(`[${i + 1}/${accounts.length}] ${name}`);

    // Load persona
    const { data: persona } = await supabase
      .from('chatbot_persona')
      .select('name, knowledge_map, voice_rules, instagram_username, gemini_raw_output')
      .eq('account_id', acc.id)
      .maybeSingle();

    if (!persona) {
      console.log('  No persona, skipping');
      skipped++;
      continue;
    }

    // Load latest profile pic
    const { data: profile } = await supabase
      .from('instagram_profile_history')
      .select('profile_pic_url, full_name')
      .eq('account_id', acc.id)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get persona identity from gemini_raw_output
    const parsed = persona.gemini_raw_output?.parsed || persona.gemini_raw_output;
    const identity = parsed?.identity || persona.knowledge_map?.identity || persona.voice_rules?.identity;
    // Use profile_full_name first (clean, human-readable), NOT persona.name (which is a long description)
    const displayName = extractCleanDisplayName(profile?.full_name, persona.name, persona.instagram_username);

    // Detect type(s) — gather ALL available text for keyword matching
    const personaText = gatherPersonaText(persona, parsed, identity);
    const { primary: influencerType, all: influencerTypes } = detectInfluencerTypes(personaText);
    const theme = themePresets[influencerType] || themePresets.other;

    // Generate greeting
    const greeting = generateGreeting(displayName, identity);

    // Avatar
    const avatarUrl = cfg.avatar_url || profile?.profile_pic_url || null;

    // Build config
    const updatedConfig = {
      ...cfg,
      display_name: displayName,
      influencer_type: influencerType,
      influencer_types: influencerTypes,
      theme,
      greeting_message: greeting,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    };

    // Save
    const { error: saveError } = await supabase
      .from('accounts')
      .update({ config: updatedConfig })
      .eq('id', acc.id);

    if (saveError) {
      console.log(`  Error: ${saveError.message}`);
    } else {
      console.log(`  Types: ${influencerTypes.join(', ')} (primary: ${influencerType}), Avatar: ${avatarUrl ? 'yes' : 'no'}`);
      console.log(`  Greeting: ${greeting.substring(0, 70)}...`);
      success++;
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Complete: ${success} updated, ${skipped} skipped`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
