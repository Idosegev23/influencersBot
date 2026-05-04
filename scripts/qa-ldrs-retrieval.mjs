#!/usr/bin/env node
/**
 * QA: LDRS retrieval sanity check.
 * For each query, generates an embedding and runs match_document_chunks against
 * the LDRS account. Prints top 5 chunks + flags whether they include
 * conference-scoped content.
 *
 * Usage: node --env-file=.env scripts/qa-ldrs-retrieval.mjs
 */

import { createClient } from '@supabase/supabase-js';

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function embed(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: [text],
      dimensions: 2000,
    }),
  });
  const json = await res.json();
  return json.data[0].embedding;
}

const QUERIES = [
  // Conference-specific (should lead with conference docs)
  { q: 'סיכום ההרצאה של איתמר', expect: 'conference' },
  { q: 'מה איתמר אמר בכנס', expect: 'conference' },
  { q: '4 עקרונות הטמעת AI', expect: 'conference' },
  { q: '5 שלבי הטמעת AI', expect: 'conference' },
  // Products (should lead with product docs)
  { q: 'מה זה NewVoices', expect: 'conference' },
  { q: 'מה זה IMAI', expect: 'conference' },
  { q: 'מה זה Leaders Platform', expect: 'conference' },
  // Sub-tools of Leaders Platform (NEW)
  { q: 'מה זה מחולל הצעות מחיר', expect: 'conference' },
  { q: 'איך עובד הבריף של לידרס', expect: 'conference' },
  { q: 'מה זה פגישת התנעה', expect: 'conference' },
  { q: 'מצגת קריאייטיבית AI', expect: 'conference' },
  // Team
  { q: 'מי ערן ניזרי', expect: 'conference' },
  { q: 'מה התפקיד של איתמר', expect: 'conference' },
  // Disambiguation (anti-signal — should NOT boost conference)
  { q: 'ספר על הפרק של איתמר אצל אבי זיתן', expect: 'non-conference' },
  // General LDRS (off-topic from conference — should retrieve regular content)
  { q: 'מה עשיתם עם נספרסו', expect: 'non-conference' },
  { q: 'אתם עושים SEO', expect: 'non-conference' },
];

async function runQuery(query, expect) {
  const embedding = await embed(query);
  const { data, error } = await supabase.rpc('match_document_chunks', {
    p_account_id: LDRS_ACCOUNT_ID,
    p_embedding: JSON.stringify(embedding),
    p_match_count: 5,
    p_match_threshold: 0.25,
    p_entity_types: null,
    p_updated_after: null,
    p_topics: null,
  });

  if (error) return { error };

  const results = (data || []).map((r) => {
    const scope = r.metadata?.scope || null;
    return {
      similarity: Number(r.similarity).toFixed(3),
      scope,
      preview: (r.chunk_text || '').slice(0, 80).replace(/\n/g, ' '),
    };
  });

  const topIsConference = results[0]?.scope === 'ai_conference_2026';
  const isGood =
    (expect === 'conference' && topIsConference) ||
    (expect === 'non-conference' && !topIsConference);

  return { results, isGood, topIsConference };
}

async function main() {
  console.log(`\nLDRS Retrieval QA — ${QUERIES.length} queries\n${'='.repeat(70)}\n`);

  let pass = 0;
  let fail = 0;
  const fails = [];

  for (const { q, expect } of QUERIES) {
    const { results, isGood, error } = await runQuery(q, expect);
    if (error) {
      console.log(`❌ ERROR "${q}": ${error.message}`);
      fail++;
      continue;
    }

    const symbol = isGood ? '✅' : '❌';
    const expectLabel = expect === 'conference' ? 'CONF' : 'GENERIC';
    console.log(`${symbol} [${expectLabel}] "${q}"`);
    for (const r of results.slice(0, 3)) {
      const scopeTag = r.scope === 'ai_conference_2026' ? '🎯' : '  ';
      console.log(`    ${scopeTag} ${r.similarity}  ${r.preview}…`);
    }
    console.log('');

    if (isGood) pass++;
    else {
      fail++;
      fails.push(q);
    }
  }

  console.log(`${'='.repeat(70)}`);
  console.log(`Pass: ${pass}/${QUERIES.length}  |  Fail: ${fail}/${QUERIES.length}`);
  if (fails.length) {
    console.log(`\nFailed queries:`);
    fails.forEach((q) => console.log(`  • ${q}`));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
