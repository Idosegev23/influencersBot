#!/usr/bin/env node
/**
 * Scrape https://plus1agency.co.il/ (homepage + about) and ingest the
 * content as a STANDALONE / EXTERNAL reference for the LDRS knowledge
 * base. Plus1 is NOT part of the LDRS group — the previous KB entry
 * incorrectly described it as a subsidiary; this rewrite makes that
 * explicit so the bot stops claiming ownership.
 *
 * Usage:
 *   node scripts/ingest-plus1-external.mjs [--dry-run]
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
const SOURCE_ID = 'plus1-agency-external-2026';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
);

if (!OPENAI_KEY) {
  console.error('✗ OPENAI_API_KEY missing');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Fetch & extract text from Plus1
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;|&amp;|&quot;|&#\d+;/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// 2. Build a Hebrew narrative document
// ---------------------------------------------------------------------------

async function buildContent() {
  const home = await fetchText('https://plus1agency.co.il/').catch(() => '');
  const about = await fetchText('https://plus1agency.co.il/about').catch(() => '');

  // Pull the talent roster line from homepage
  const rosterMatch = home.match(/לכל הטאלנטים([\s\S]*?)(?:מחלקה דוגמנים|פלטפורמה אינסטגרם)/);
  const roster = rosterMatch
    ? rosterMatch[1].replace(/\s+/g, ' ').slice(0, 600).trim()
    : '';

  return `# Plus One — סוכנות טאלנטים (חיצונית, **לא** חלק מקבוצת LDRS)

## מי זה Plus One
Plus One היא סוכנות טאלנטים ישראלית עצמאית, ממוקמת בבן יהודה 99, תל אביב. טלפון: 03-527-2748.
האתר הרשמי: https://plus1agency.co.il/

## ⚠️ הבהרה חשובה (קונטקסט פנימי ל-LDRS)
**Plus One אינה חלק מקבוצת LDRS.** היא סוכנות עצמאית, נפרדת מ-LDRS Group.
אם מבקר שואל על Plus One כשייכת ל-LDRS — להבהיר בנימוס שזאת סוכנות עצמאית, לא חברה־בת ולא ענף של הקבוצה.
האתר שלהם מציין שותפויות מ-2021 (ייצוג 1, אלעד רגב, חברת לידרס) — אבל זה לא הופך אותם לחלק מקבוצת LDRS היום.

## מה הם עושים (לפי האתר שלהם)
- סוכנות טאלנטים ויוצרי תוכן בדיגיטל, משחק וטלוויזיה
- מענה 360° — חיבור למותגים, קמפיינים סושיאל, ליהוק לסדרות / סרטים / הצגות, יצירת תוכן מקורי
- אסטרטגיות מותאמות אישית לכל טאלנט / לקוח
- ניהול קמפיינים ומדידת תוצאות

## מחלקות
דוגמנים, טיקטוקרים, טלוויזיה, יוטיוברים, יוצרי תוכן, משפיענים, סטנדאפיסטים/יות, שחקנים.

## נישות
אופנה, בידור, ביוטי, הורות, טכנולוגיה, לייף סטייל, ספורט, פוּדיז, תיירות.

## פלטפורמות
אינסטגרם, טיקטוק, יוטיוב.

${roster ? `## דוגמאות לטאלנטים (חלקיים, מהאתר שלהם)\n${roster}` : ''}

## איך לדבר על זה בצ'אט של LDRS
- אם שואלים "מה זה Plus One / יצוג1?" → "סוכנות טאלנטים עצמאית בתל אביב — לא חלק מקבוצת לידרס. אם מחפשים טאלנט לקמפיין, הם אופציה טובה אבל זה לא משהו שאנחנו מתפעלים."
- אם מבולבלים בין Plus One לבין LDRS → להבהיר שהם שתי חברות שונות.
- LDRS בעצמה היא סוכנות שיווק משפיענים 360° (לא סוכנות טאלנטים), ויש לה את IMAI, NewVoices, ופלטפורמת Bestie. Plus One — נפרד.

## תוכן רקע מהאתר (Raw)
${about.slice(0, 1200) || home.slice(0, 1200)}
`;
}

// ---------------------------------------------------------------------------
// 3. Chunking + embeddings
// ---------------------------------------------------------------------------

function chunkText(text, { maxChars = 1800 } = {}) {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

const estimateTokens = (s) => Math.ceil(s.length / 2.5);

async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: texts,
      dimensions: 2000,
    }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('→ scraping plus1agency.co.il');
  const text = await buildContent();
  const chunks = chunkText(text);
  console.log(`  built ${chunks.length} chunks (${text.length} chars total)`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — full document text below ---\n');
    console.log(text);
    return;
  }

  // Replace any prior version
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', LDRS_ACCOUNT_ID)
    .eq('source_id', SOURCE_ID)
    .maybeSingle();
  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
    console.log(`  replaced existing doc ${existing.id}`);
  }

  const metadata = {
    url: 'https://plus1agency.co.il/',
    type: 'external_reference',
    relationship_to_ldrs: 'NOT_AFFILIATED',
    scope: 'ai_conference_2026',
    topic: 'industry_context',
    authority: 'canonical',
    ingested_at: new Date().toISOString(),
    ingested_by: 'ingest-plus1-external',
  };

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id: LDRS_ACCOUNT_ID,
      entity_type: 'website',
      source_id: SOURCE_ID,
      title: 'Plus One — סוכנות טאלנטים (עצמאית, לא חלק מ-LDRS)',
      source: 'website',
      status: 'active',
      chunk_count: chunks.length,
      total_tokens: chunks.reduce((s, c) => s + estimateTokens(c), 0),
      metadata,
    })
    .select('id')
    .single();
  if (docErr || !doc) throw new Error(`document insert failed: ${docErr?.message}`);

  console.log(`  inserted document ${doc.id}`);

  // Embed in batches
  const BATCH = 32;
  const vecs = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const v = await embedBatch(batch);
    vecs.push(...v);
  }

  const rows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    account_id: LDRS_ACCOUNT_ID,
    entity_type: 'website',
    chunk_index: i,
    chunk_text: chunk,
    embedding: vecs[i],
    token_count: estimateTokens(chunk),
    metadata: { ...metadata, chunk_of: SOURCE_ID, title: 'Plus One — external' },
    topic: metadata.topic,
    chunk_hash: crypto.createHash('md5').update(chunk).digest('hex'),
  }));

  const { error: chErr } = await supabase.from('document_chunks').insert(rows);
  if (chErr) throw new Error(`chunks insert failed: ${chErr.message}`);

  console.log(`✓ ingested ${chunks.length} chunks for ${SOURCE_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
