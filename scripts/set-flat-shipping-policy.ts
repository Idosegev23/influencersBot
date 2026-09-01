/**
 * Flat ₪25 shipping, no free-shipping tier — for ARGANIA, LA BEAUTÉ and STUDIO PASHA.
 *
 * The brands charge 25 ₪ per order, fixed, regardless of basket value. There is no
 * free-shipping threshold. Both live sites now say exactly that ("משלוח עד הבית
 * בעלות של 25 ₪ בלבד"), but our data still carried an older "משלוח חינם מעל ₪250"
 * promise across five separate surfaces, so the bot kept promising it.
 *
 * The five surfaces, in order of how directly a customer hits them:
 *   1. config.widget.prompt.faq        — Argania's FAQ *answered* "משלוח חינם מעל ₪250"
 *   2. config.widget.chips_overrides   — Argania's cart chip invited "יש משלוח חינם?"
 *   3. config.whatsapp_cs.policy       — injected verbatim into the CS brain (WA + web CS)
 *   4. knowledge_base RAG chunk        — authoritative, and survives a re-scan (ingest only
 *                                        replaces docs matching account+entity_type+source_id)
 *   5. stale free-shipping chunks      — 38 scraped Argania product pages + 3 creator posts
 *
 * Scraped site chrome is rewritten in place (the live site is already correct, so a
 * re-scan converges on the same text). Creator posts and video transcripts are real
 * historical quotes, so they keep their wording and get a dated correction appended
 * instead — the bot sees the retraction next to the claim.
 *
 * Idempotent. Run:
 *   npx tsx scripts/set-flat-shipping-policy.ts --dry-run
 *   npx tsx scripts/set-flat-shipping-policy.ts
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });
import { createClient } from '@supabase/supabase-js';
import { generateEmbeddings } from '../src/lib/rag/embeddings';
import crypto from 'crypto';

const DRY = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
if (!SUPABASE_URL || !SECRET_KEY || !process.env.OPENAI_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / OPENAI_API_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SECRET_KEY);

const EFFECTIVE_DATE = '01/09/2026';

type Brand = {
  accountId: string;
  label: string;
  /** Stable id for this brand's hand-authored policy doc. LA BEAUTÉ already has one. */
  policyDocId: string;
  policyDocTitle: string;
};

const BRANDS: Brand[] = [
  {
    accountId: 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1',
    label: 'ARGANIA',
    policyDocId: '00000000-0000-0000-0000-000000000011',
    policyDocTitle: 'ARGANIA — Service Policy Knowledge',
  },
  {
    accountId: '432dea15-707f-4cfe-b7e2-331c7a02b228',
    label: 'LA BEAUTÉ',
    // Pre-existing doc from scripts/seed-labeaute-policy-chunks.ts — append, never wipe.
    policyDocId: '00000000-0000-0000-0000-000000000001',
    policyDocTitle: 'LA BEAUTÉ — Service Policy Knowledge',
  },
  {
    accountId: '36705ad6-4f82-46af-95e1-fb5ea6f4a44f',
    label: 'STUDIO PASHA',
    policyDocId: '00000000-0000-0000-0000-000000000012',
    policyDocTitle: 'STUDIO PASHA — Service Policy Knowledge',
  },
];

const SHIPPING_TOPIC = 'shipping_cost';

/** The one canonical statement. Everything else on this page is a rendering of it. */
function policyChunk(label: string): string {
  return `עלות משלוח ${label}:
דמי המשלוח הם 25 ₪ לכל הזמנה — סכום קבוע, ללא תלות בגובה ההזמנה.
אין משלוח חינם, ואין סף סכום שמזכה במשלוח חינם. גם בהזמנה גדולה דמי המשלוח נשארים 25 ₪.
אם מופיע בתוכן ישן, בפוסט או בסרטון של יוצרת תוכן מבצע של "משלוח חינם מעל סכום מסוים" — המבצע אינו בתוקף. התשובה הנכונה היא 25 ₪ קבוע.

[שאלות קשורות: כמה עולה המשלוח? יש משלוח חינם? מאיזה סכום המשלוח חינם? כמה דמי משלוח?]`;
}

const CS_POLICY_CLAUSE = `דמי משלוח: דמי המשלוח הם 25 ₪ לכל הזמנה — סכום קבוע, ללא תלות בגובה ההזמנה. אין משלוח חינם ואין סף סכום שמזכה במשלוח חינם. אין להבטיח משלוח חינם בשום מצב, גם אם מופיע מבצע ישן בתוכן שיווקי או בפוסט של יוצרת תוכן.`;

const FAQ_Q = 'כמה עולה המשלוח?';
const FAQ_A = 'דמי המשלוח הם 25 ₪ לכל הזמנה, ללא תלות בסכום ההזמנה. אין משלוח חינם.';

const CORRECTION = `\n\n[עדכון מדיניות — נכון ל-${EFFECTIVE_DATE}: אין משלוח חינם. דמי המשלוח הם 25 ₪ לכל הזמנה, ללא תלות בסכום. מבצע משלוח חינם שמוזכר למעלה אינו בתוקף.]`;

/** Scraped site chrome — the live site already reads this way. */
const SITE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/משלוח חינם מעל ₪250/g, 'משלוח בעלות 25 ₪ לכל הזמנה (אין משלוח חינם)'],
];

const log = (...a: unknown[]) => console.log(...a);
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

// ---------------------------------------------------------------- 1-3. config

async function updateConfig(brand: Brand) {
  const { data: acct, error } = await supabase
    .from('accounts').select('config').eq('id', brand.accountId).single();
  if (error || !acct) throw new Error(`${brand.label}: read config failed: ${error?.message}`);

  const config = JSON.parse(JSON.stringify(acct.config ?? {}));
  const changes: string[] = [];

  // 1. widget FAQ — drop any free-shipping promise, then guarantee a cost answer.
  const faq = config?.widget?.prompt?.faq;
  if (Array.isArray(faq)) {
    for (const entry of faq) {
      if (typeof entry?.answer === 'string' && /משלוח חינם/.test(entry.answer)) {
        const before = entry.answer;
        entry.answer = entry.answer
          .replace(/\s*משלוח חינם מעל ₪?\s*\d+\s*\.?/g, ' דמי משלוח 25 ₪ לכל הזמנה.')
          .replace(/\s+/g, ' ')
          .trim();
        changes.push(`widget.prompt.faq answer: "${before}" → "${entry.answer}"`);
      }
    }
    if (!faq.some((e: { question?: string }) => e?.question === FAQ_Q)) {
      faq.push({ question: FAQ_Q, answer: FAQ_A });
      changes.push(`widget.prompt.faq += "${FAQ_Q}"`);
    }
  }

  // 2. widget chips — an invitation to ask about a perk that does not exist.
  const chips = config?.widget?.chips_overrides;
  if (chips && typeof chips === 'object') {
    for (const [surface, list] of Object.entries(chips)) {
      if (!Array.isArray(list)) continue;
      list.forEach((chip, i) => {
        if (typeof chip === 'string' && /משלוח חינם/.test(chip)) {
          list[i] = FAQ_Q;
          changes.push(`widget.chips_overrides.${surface}[${i}]: "${chip}" → "${FAQ_Q}"`);
        }
      });
    }
  }

  // 3. CS policy — injected verbatim into the CS brain for WhatsApp CS and web CS.
  // Only `whatsapp_cs.enabled === true` enrols an account in WhatsApp CS, so writing
  // `policy` alone onto LA BEAUTÉ (which has cs_web.enabled) turns nothing else on.
  const existingPolicy: unknown = config?.whatsapp_cs?.policy;
  const policyText = typeof existingPolicy === 'string' ? existingPolicy : '';
  if (!policyText.includes('דמי משלוח:')) {
    config.whatsapp_cs = config.whatsapp_cs ?? {};
    config.whatsapp_cs.policy = policyText.trim()
      ? `${policyText.trimEnd()}\n\n${CS_POLICY_CLAUSE}`
      : `מדיניות שירות לקוחות — ${brand.label}\n\n${CS_POLICY_CLAUSE}`;
    changes.push(policyText.trim()
      ? 'whatsapp_cs.policy += shipping clause'
      : 'whatsapp_cs.policy created with shipping clause');
  }

  // 4. persona — Argania listed free shipping as a topic the bot may volunteer.
  const { data: persona } = await supabase
    .from('chatbot_persona').select('id, boundaries').eq('account_id', brand.accountId).maybeSingle();
  if (persona?.boundaries) {
    const b = JSON.parse(JSON.stringify(persona.boundaries));
    let touched = false;
    if (Array.isArray(b.discussed)) {
      b.discussed.forEach((t: string, i: number) => {
        if (typeof t === 'string' && /משלוח חינם/.test(t)) {
          const next = t.replace(/\s*ו?הטבת משלוח חינם/g, '').trim() || 'מדיניות משלוחים';
          b.discussed[i] = next === 'מדיניות משלוחים' ? next : `${next} ודמי משלוח`;
          changes.push(`persona.boundaries.discussed[${i}]: "${t}" → "${b.discussed[i]}"`);
          touched = true;
        }
      });
    }
    if (touched && !DRY) {
      const { error: pErr } = await supabase
        .from('chatbot_persona').update({ boundaries: b }).eq('id', persona.id);
      if (pErr) throw new Error(`${brand.label}: persona update failed: ${pErr.message}`);
    }
  }

  if (!changes.length) { log(`  config: already correct`); return; }
  for (const c of changes) log(`  · ${c}`);
  if (DRY) return;

  const { error: upErr } = await supabase
    .from('accounts').update({ config }).eq('id', brand.accountId);
  if (upErr) throw new Error(`${brand.label}: config update failed: ${upErr.message}`);
}

// ------------------------------------------------------- 4. authoritative chunk

async function upsertPolicyChunk(brand: Brand) {
  const text = policyChunk(brand.label);

  const { data: existing } = await supabase
    .from('document_chunks').select('id, chunk_text')
    .eq('account_id', brand.accountId).eq('document_id', brand.policyDocId)
    .eq('topic', SHIPPING_TOPIC).maybeSingle();

  if (existing?.chunk_text === text) { log(`  knowledge_base chunk: already correct`); return; }
  log(`  · knowledge_base chunk (${SHIPPING_TOPIC}): ${existing ? 'update' : 'insert'}`);
  if (DRY) return;

  const [embedding] = await generateEmbeddings([text]);

  // Parent doc must exist for the FK. Never wipe siblings — LA BEAUTÉ's doc already
  // holds 7 other policy chunks from the 2026-05 seed.
  const { count } = await supabase
    .from('document_chunks').select('id', { count: 'exact', head: true })
    .eq('document_id', brand.policyDocId);
  const { error: docErr } = await supabase.from('documents').upsert({
    id: brand.policyDocId,
    account_id: brand.accountId,
    entity_type: 'knowledge_base',
    title: brand.policyDocTitle,
    source: 'manual_seed',
    status: 'active',
    chunk_count: (count ?? 0) + (existing ? 0 : 1),
    metadata: { kind: 'policy_seed' },
  }, { onConflict: 'id' });
  if (docErr) throw new Error(`${brand.label}: document upsert failed: ${docErr.message}`);

  const row = {
    document_id: brand.policyDocId,
    account_id: brand.accountId,
    entity_type: 'knowledge_base',
    chunk_text: text,
    embedding,
    token_count: Math.ceil(text.length / 4),
    metadata: { topic: SHIPPING_TOPIC, source: `shipping_policy_${EFFECTIVE_DATE}` },
    topic: SHIPPING_TOPIC,
    chunk_hash: md5(text),
  };

  if (existing) {
    const { error } = await supabase.from('document_chunks').update(row).eq('id', existing.id);
    if (error) throw new Error(`${brand.label}: chunk update failed: ${error.message}`);
  } else {
    const { data: maxRow } = await supabase
      .from('document_chunks').select('chunk_index')
      .eq('document_id', brand.policyDocId).order('chunk_index', { ascending: false })
      .limit(1).maybeSingle();
    const { error } = await supabase.from('document_chunks')
      .insert({ ...row, chunk_index: (maxRow?.chunk_index ?? -1) + 1 });
    if (error) throw new Error(`${brand.label}: chunk insert failed: ${error.message}`);
  }
}

// ----------------------------------------------------------- 5. stale claims

async function fixStaleChunks(brand: Brand) {
  const { data: chunks, error } = await supabase
    .from('document_chunks').select('id, entity_type, chunk_text')
    .eq('account_id', brand.accountId).like('chunk_text', '%חינם%');
  if (error) throw new Error(`${brand.label}: chunk scan failed: ${error.message}`);

  const targets = (chunks ?? []).filter(
    (c) => /(משלוח|משלוחים) חינם/.test(c.chunk_text) && c.entity_type !== 'knowledge_base',
  );
  if (!targets.length) { log(`  stale chunks: none`); return; }

  const updates: Array<{ id: string; text: string; kind: string }> = [];
  for (const c of targets) {
    if (c.entity_type === 'website') {
      // Site chrome, not a person's words — rewrite to match the live site.
      let text = c.chunk_text;
      for (const [re, to] of SITE_REPLACEMENTS) text = text.replace(re, to);
      if (text !== c.chunk_text) updates.push({ id: c.id, text, kind: 'website rewrite' });
      else updates.push({ id: c.id, text: c.chunk_text + CORRECTION, kind: 'website correction' });
    } else if (!c.chunk_text.includes('[עדכון מדיניות')) {
      // A real quote from a post or video — keep the words, append the retraction.
      updates.push({ id: c.id, text: c.chunk_text + CORRECTION, kind: `${c.entity_type} correction` });
    }
  }
  if (!updates.length) { log(`  stale chunks: already corrected`); return; }

  const byKind = updates.reduce<Record<string, number>>(
    (a, u) => ({ ...a, [u.kind]: (a[u.kind] ?? 0) + 1 }), {});
  for (const [kind, n] of Object.entries(byKind)) log(`  · ${n} × ${kind}`);
  if (DRY) return;

  // chunk_text changed, so the stored embedding is stale — re-embed. (fts is a
  // generated column and updates itself.)
  const embeddings = await generateEmbeddings(updates.map((u) => u.text));
  if (embeddings.length !== updates.length) {
    throw new Error(`${brand.label}: embedding count mismatch ${embeddings.length}/${updates.length}`);
  }
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const { error: uErr } = await supabase.from('document_chunks').update({
      chunk_text: u.text,
      embedding: embeddings[i],
      chunk_hash: md5(u.text),
      token_count: Math.ceil(u.text.length / 4),
    }).eq('id', u.id);
    if (uErr) throw new Error(`${brand.label}: chunk ${u.id} update failed: ${uErr.message}`);
  }
  log(`  ✓ re-embedded ${updates.length} chunks`);
}

async function main() {
  log(DRY ? '— DRY RUN —\n' : '— APPLYING —\n');
  for (const brand of BRANDS) {
    log(`${brand.label} (${brand.accountId})`);
    await updateConfig(brand);
    await upsertPolicyChunk(brand);
    await fixStaleChunks(brand);
    log('');
  }
  log(DRY ? 'Dry run complete — nothing written.' : 'Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
