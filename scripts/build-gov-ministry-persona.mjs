#!/usr/bin/env node
/**
 * Build a chatbot_persona row for a government_ministry archetype account.
 * Reads scraped website content (instagram_bio_websites) and uses GPT-5.4
 * to derive ministry-specific tone, topics, FAQ, and voice rules.
 *
 * Also sets accounts.config.archetype = 'government_ministry' if not already.
 *
 * Usage:
 *   node --env-file=.env scripts/build-gov-ministry-persona.mjs <account_id>
 */

import { createClient } from '@supabase/supabase-js';

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: node --env-file=.env scripts/build-gov-ministry-persona.mjs <account_id>');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ============================================
// 1. Load account + pages
// ============================================
console.log(`\n=== Building persona for ${accountId} ===`);
const { data: account, error: accErr } = await supabase
  .from('accounts')
  .select('id, config, type, language')
  .eq('id', accountId)
  .single();
if (accErr || !account) {
  console.error('Account not found:', accErr?.message);
  process.exit(1);
}
const displayName = account.config?.display_name || account.config?.username || accountId;
console.log(`Ministry: ${displayName}`);

const { data: pages, error: pagesErr } = await supabase
  .from('instagram_bio_websites')
  .select('url, page_title, page_description, page_content')
  .eq('account_id', accountId)
  .order('scraped_at', { ascending: false })
  .limit(60);
if (pagesErr || !pages || pages.length === 0) {
  console.error('No scraped pages found:', pagesErr?.message);
  process.exit(1);
}
console.log(`Loaded ${pages.length} scraped pages`);

// Build content digest — title + description + first 300 chars of content per page
const digest = pages.slice(0, 50).map((p, i) => {
  const body = (p.page_content || '').replace(/\s+/g, ' ').trim().slice(0, 350);
  return `[${i + 1}] ${p.page_title || '(no title)'}\nURL: ${p.url}\n${body}`;
}).join('\n\n');

// ============================================
// 2. Build prompt for GPT-5.4
// ============================================
const prompt = `אתה אדריכל פרסונה של עוזר חכם לרשות ממשלתית. על בסיס תוכן האתר הרשמי של "${displayName}", הפק פרסונה מובנית בפורמט JSON תקני בלבד (ללא טקסט נוסף, ללא markdown).

הפרסונה משמשת לבוט שירות לאזרחים. דרישות:
- פורמלי-נגיש, ענייני, מדויק.
- בלי סלנג, בלי הומור.
- אמוג'י מצומצם (✅ ⚠️ 📌 בלבד, ורק בדגשים).
- ניטרלי מגדרית: "פנה/י", "המבקש/ת".
- בלי גוף ראשון "אני אישית".

תוכן האתר (דגימה של ${pages.length} דפים):
${digest.slice(0, 14000)}

החזר JSON בפורמט הזה בדיוק (כל הטקסט בעברית):

{
  "name": "${displayName}",
  "bio": "1-2 משפטים: מה הרשות עושה ולמי היא מיועדת",
  "description": "פסקה של 3-5 משפטים: היקף הפעילות, אוכלוסיות יעד, סוגי שירות, ערוצי קשר רשמיים",
  "tone": "פורמלי-נגיש, ענייני, מדויק",
  "language": "he",
  "response_style": "תיאור קצר של אופן המענה — מבנה תשובה, אורך, רמת פירוט",
  "emoji_usage": "minimal",
  "greeting_message": "ברכת פתיחה של משפט-שניים שמסבירה מה הבוט יכול לעזור בו",
  "topics": ["נושא 1", "נושא 2", "..."],            // 6-12 נושאים מרכזיים שעולים מהתוכן
  "interests": ["תחום עיסוק 1", "..."],            // 4-8 תחומי עיסוק רחבים
  "common_phrases": ["משפט שגרתי 1", "..."],        // 4-8 ניסוחים שמתאימים לבוט
  "directives": ["הנחיה 1", "..."],                 // 4-8 הנחיות סגנון/דיוק שהבוט חייב לקיים
  "faq": [
    { "question": "שאלה שכיחה", "answer": "תשובה ממוקדת על בסיס התוכן" },
    "..."
  ],                                                // 5-10 שאלות נפוצות עם תשובות קצרות (משפט-שניים) בהתבסס על מה שמופיע בתוכן
  "voice_rules": {
    "firstPerson": "ניטרלי — בלי 'אני אישית'",
    "addressUser": "פנה/י, את/ה",
    "formality": "פורמלי-נגיש",
    "forbidden": ["סלנג", "תארים מקצועיים בלי הסבר", "המצאת מספרי תקנות", "הבטחת תוצאות"]
  },
  "knowledge_map": {
    "core_topics": ["...."],                        // 5-8 נושאי הליבה של הרשות (זהה ל-topics אבל מתומצת)
    "key_services": ["שירות 1", "..."],            // 4-10 שירותים עיקריים שהרשות מספקת לפי התוכן
    "key_publications": ["סוג פרסום 1", "..."]     // סוגי פרסומים (חוזרי מנכ"ל, תקנונים, דוחות, וכו')
  },
  "boundaries": {
    "off_topic_response": "תגובה לשאלה מחוץ לתחום הרשות",
    "no_legal_advice": true,
    "no_personal_decisions": true,
    "always_cite_source": true,
    "out_of_scope_examples": ["סוג שאלה שלא נענה עליה 1", "..."]
  },
  "response_policy": {
    "max_response_length": "2-4 פסקאות קצרות",
    "structure": "תשובה ישירה → פירוט בנקודות → מקור רשמי",
    "cite_sources_inline": true,
    "fallback_when_unknown": "אין לי מידע ודאי על זה. אני ממליץ לפנות ישירות לרשות בערוצים הרשמיים."
  }
}

חשוב:
- כל שדה חייב להיות מבוסס על התוכן שראית. אל תמציא שירותים/מספרים/תאריכים.
- החזר JSON תקני בלבד. אל תוסיף הסבר, אל תעטוף ב-\`\`\`json.`;

// ============================================
// 3. Call GPT-5.4
// ============================================
console.log(`\nCalling GPT-5.4 (input ~${(prompt.length / 1024).toFixed(1)}KB)...`);
const startMs = Date.now();
const resp = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-5.4',
    input: prompt,
    reasoning: { effort: 'medium' },
    text: { format: { type: 'text' } },
  }),
  signal: AbortSignal.timeout(300000),
});
if (!resp.ok) {
  console.error('GPT-5.4 error:', resp.status, (await resp.text()).slice(0, 300));
  process.exit(1);
}
const result = await resp.json();

// Extract text — matches the parsing in src/lib/ai/gemini-persona-builder.ts
let text = null;
const rawOutput = result.output;
if (typeof rawOutput === 'string') text = rawOutput;
else if (Array.isArray(rawOutput)) {
  const msg = rawOutput.find((x) => x.type === 'message');
  const t = msg?.content?.find((c) => c.type === 'output_text' || c.text);
  text = t?.text;
} else if (rawOutput && typeof rawOutput === 'object') {
  text = rawOutput.text || rawOutput.content;
}
if (!text) {
  console.error('No text in GPT response:', JSON.stringify(result).slice(0, 500));
  process.exit(1);
}
console.log(`GPT-5.4 done in ${((Date.now() - startMs) / 1000).toFixed(1)}s — ${text.length} chars`);

// Strip code fences if present, just in case
const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

let persona;
try {
  persona = JSON.parse(jsonText);
} catch (e) {
  console.error('Failed to parse JSON. First 500 chars:', jsonText.slice(0, 500));
  process.exit(1);
}

console.log(`\nPersona extracted:`);
console.log(`  name: ${persona.name}`);
console.log(`  topics: ${persona.topics?.length || 0}`);
console.log(`  faq: ${persona.faq?.length || 0}`);
console.log(`  services: ${persona.knowledge_map?.key_services?.length || 0}`);

// ============================================
// 4. Update accounts.config.archetype + greeting
// ============================================
const newConfig = {
  ...account.config,
  archetype: 'government_ministry',
  influencer_type: 'gov',
};
if (persona.greeting_message && !newConfig.widget?.welcomeMessage) {
  newConfig.widget = { ...(newConfig.widget || {}), welcomeMessage: persona.greeting_message };
}
const { error: accUpdErr } = await supabase
  .from('accounts')
  .update({ config: newConfig })
  .eq('id', accountId);
if (accUpdErr) console.error('  accounts update warning:', accUpdErr.message);
else console.log('  accounts.config.archetype = government_ministry');

// ============================================
// 5. Upsert chatbot_persona
// ============================================
const personaRow = {
  account_id: accountId,
  name: persona.name || displayName,
  tone: persona.tone || 'פורמלי-נגיש',
  language: persona.language || 'he',
  bio: persona.bio || null,
  description: persona.description || null,
  interests: Array.isArray(persona.interests) ? persona.interests : null,
  topics: Array.isArray(persona.topics) ? persona.topics : null,
  response_style: persona.response_style || null,
  emoji_usage: persona.emoji_usage || 'minimal',
  greeting_message: persona.greeting_message || null,
  faq: persona.faq || null,
  directives: Array.isArray(persona.directives) ? persona.directives : null,
  voice_rules: persona.voice_rules || null,
  knowledge_map: persona.knowledge_map || null,
  boundaries: persona.boundaries || null,
  response_policy: persona.response_policy || null,
  common_phrases: Array.isArray(persona.common_phrases) ? persona.common_phrases : null,
  metadata: { source: 'gov-ministry-persona-builder', model: 'gpt-5.4', pages_analyzed: pages.length, built_at: new Date().toISOString() },
};

// Check if persona row already exists
const { data: existing } = await supabase
  .from('chatbot_persona')
  .select('id')
  .eq('account_id', accountId)
  .maybeSingle();

let writeErr;
if (existing) {
  ({ error: writeErr } = await supabase
    .from('chatbot_persona')
    .update({ ...personaRow, updated_at: new Date().toISOString() })
    .eq('account_id', accountId));
  console.log(`  Updated existing persona row (id=${existing.id})`);
} else {
  ({ error: writeErr } = await supabase
    .from('chatbot_persona')
    .insert(personaRow));
  console.log('  Created new persona row');
}
if (writeErr) {
  console.error('  persona save error:', writeErr.message);
  process.exit(1);
}

// ============================================
// 6. Regenerate chat tab config so chat page reflects new archetype.
// generateTabConfig lives in a TS module that can't be imported from .mjs cleanly,
// so we spawn tsx as a child process — same effect, simpler.
// ============================================
console.log('\nRegenerating tab config (tabs / subtitle / header / greeting)...');
const { spawnSync } = await import('node:child_process');
const r = spawnSync(
  'npx',
  ['tsx', '--tsconfig', 'tsconfig.json', 'scripts/generate-tab-config.ts', accountId],
  { stdio: 'inherit' },
);
if (r.status !== 0) {
  console.warn(`  Tab-config regen exited ${r.status}. Run manually:`);
  console.warn(`    npx tsx --tsconfig tsconfig.json scripts/generate-tab-config.ts ${accountId}`);
}

console.log(`\n✅ Done — ${displayName}`);
