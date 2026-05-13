#!/usr/bin/env node
/**
 * Build a chatbot_persona row for an English-language brand/SaaS account
 * (initial use case: influencermarketing.ai / IMAI). Reads scraped website
 * content from instagram_bio_websites and uses GPT-5.4 to derive product-aware
 * tone, topics, FAQ, and voice rules — in English.
 *
 * Sister script of build-gov-ministry-persona.mjs; differs in prompt language,
 * archetype (brand), and tone (professional B2B SaaS, not formal/gov).
 *
 * Usage:
 *   node --env-file=.env scripts/build-imai-persona.mjs <account_id>
 */

import { createClient } from '@supabase/supabase-js';

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: node --env-file=.env scripts/build-imai-persona.mjs <account_id>');
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

console.log(`\n=== Building English persona for ${accountId} ===`);
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
console.log(`Brand: ${displayName}`);

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

const digest = pages.slice(0, 50).map((p, i) => {
  const body = (p.page_content || '').replace(/\s+/g, ' ').trim().slice(0, 350);
  return `[${i + 1}] ${p.page_title || '(no title)'}\nURL: ${p.url}\n${body}`;
}).join('\n\n');

const prompt = `You are the persona architect for an English-language AI assistant on the ${displayName} website. Based on the official website content below, produce a structured persona as valid JSON only (no extra text, no markdown).

This persona drives a B2B SaaS website chatbot. Requirements:
- Professional yet conversational, data-aware.
- Concise — enterprise marketers value clarity over hype.
- Emojis allowed sparingly (only when emphasizing a feature or status — never decorative).
- Gender-neutral. American English.
- Third-person voice ("we offer", "the platform supports") — not "I personally...".

Website content (${pages.length} pages sampled):
${digest.slice(0, 14000)}

Return JSON in exactly this shape (all values in English):

{
  "name": "${displayName}",
  "bio": "1-2 sentences: what the company does and who it's for",
  "description": "3-5 sentence paragraph: product scope, target customer, key workspaces/features, what makes it different",
  "tone": "professional, conversational, data-aware",
  "language": "en",
  "response_style": "Short description of how the bot answers — structure, length, level of detail",
  "emoji_usage": "minimal",
  "greeting_message": "1-2 sentence welcome that explains what visitors can ask about",
  "topics": ["topic 1", "topic 2", "..."],            // 6-12 main topics surfaced in the content (e.g. 'influencer discovery', 'consumer intelligence')
  "interests": ["domain 1", "..."],                   // 4-8 broad domains the platform covers
  "common_phrases": ["typical phrase 1", "..."],      // 4-8 phrasings appropriate for the bot
  "directives": ["directive 1", "..."],               // 4-8 style/accuracy directives the bot must follow
  "faq": [
    { "question": "common question", "answer": "focused answer grounded in the content" },
    "..."
  ],                                                  // 6-12 FAQs with short answers (1-2 sentences) based on what's actually in the content
  "voice_rules": {
    "firstPerson": "We / our team — never 'I personally'",
    "addressUser": "you, your team",
    "formality": "professional yet conversational",
    "forbidden": ["hype words like 'revolutionary'", "competitor name-dropping", "fabricating features or pricing", "promising specific ROI numbers"]
  },
  "knowledge_map": {
    "core_topics": ["..."],                           // 5-8 product pillars
    "key_workspaces": ["workspace 1", "..."],         // 4-10 named workspaces / modules from the site
    "key_integrations": ["integration type 1", "..."] // categories of integrations (e-commerce, CRM, payment, social, etc.)
  },
  "boundaries": {
    "off_topic_response": "Polite response when the question is outside the product scope",
    "no_legal_advice": true,
    "no_competitor_comparisons": true,
    "always_ground_in_site": true,
    "out_of_scope_examples": ["type of question we won't answer 1", "..."]
  },
  "response_policy": {
    "max_response_length": "2-4 short paragraphs",
    "structure": "direct answer → key features/benefits → next step (demo, docs, contact)",
    "cite_sources_inline": false,
    "fallback_when_unknown": "I don't have specifics on that yet — the best place to confirm is our team. Want me to point you to a demo request?"
  }
}

Important:
- Every field must be grounded in the content you saw. Do not invent workspaces, prices, customer names, or features.
- Return valid JSON only. No commentary, no markdown fences.`;

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
console.log(`  workspaces: ${persona.knowledge_map?.key_workspaces?.length || 0}`);

// Update accounts.config — preserve archetype if already set, ensure widget welcomeMessage
const newConfig = {
  ...account.config,
  archetype: account.config?.archetype || 'brand',
};
// Only overwrite welcomeMessage if the operator hasn't set one explicitly
if (persona.greeting_message && !newConfig.widget?.welcomeMessage) {
  newConfig.widget = { ...(newConfig.widget || {}), welcomeMessage: persona.greeting_message };
}
const { error: accUpdErr } = await supabase
  .from('accounts')
  .update({ config: newConfig })
  .eq('id', accountId);
if (accUpdErr) console.error('  accounts update warning:', accUpdErr.message);
else console.log(`  accounts.config.archetype = ${newConfig.archetype}`);

const personaRow = {
  account_id: accountId,
  name: persona.name || displayName,
  tone: persona.tone || 'professional, conversational',
  language: persona.language || 'en',
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
  metadata: { source: 'imai-persona-builder', model: 'gpt-5.4', pages_analyzed: pages.length, built_at: new Date().toISOString() },
};

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

console.log('\nRegenerating tab config...');
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
