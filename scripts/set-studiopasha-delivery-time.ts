/**
 * STUDIO PASHA delivery time is 7 business days — one number, everywhere.
 *
 * Our data carried three different answers, all reachable by the bot:
 *   "עד 3 ימי עסקים"  — the site's FAQ page (×2 chunks) and the widget FAQ
 *   "עד 5 ימי עסקים"  — the shipping-policy page + the banner on 10 product pages
 *   "עד 7 ימי עסקים"  — the live homepage banner, and the brand confirms this is the truth
 * The brand is correcting their own site, so the scraped chunks converge on 7 anyway;
 * this makes the bot right in the meantime.
 *
 * NOT touched: "מרגע קבלת ה-SMS החבילה צפויה להגיע תוך 2 ימי עסקים" — that is a
 * different fact (courier hand-off → doorstep), not order → delivery. Blindly
 * rewriting every "N ימי עסקים" would have corrupted it.
 *
 * Same surface map and same scrub rule as scripts/set-flat-shipping-policy.ts:
 * site chrome is rewritten in place, a creator's real words keep their wording and
 * carry a dated retraction instead.
 *
 * Idempotent. Run:
 *   npx tsx scripts/set-studiopasha-delivery-time.ts --dry-run
 *   npx tsx scripts/set-studiopasha-delivery-time.ts
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

const ACCOUNT_ID = '36705ad6-4f82-46af-95e1-fb5ea6f4a44f';
const LABEL = 'STUDIO PASHA';
const POLICY_DOC_ID = '00000000-0000-0000-0000-000000000012';
const TOPIC = 'shipping_time';
const EFFECTIVE_DATE = '01/09/2026';

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
const log = (...a: unknown[]) => console.log(...a);

const POLICY_TEXT = `זמני משלוח ${LABEL}:
המשלוח מגיע עד 7 ימי עסקים ממועד ביצוע ההזמנה באתר.
זה הזמן המחייב — אם מופיע בתוכן ישן, בפוסט של יוצרת תוכן או בדף באתר זמן קצר יותר (3 או 5 ימי עסקים), הוא אינו בתוקף.
לאחר שהחבילה יוצאת מהמחסן נשלחת הודעת SMS מחברת השילוח עם מעקב, ומרגע קבלת ה-SMS החבילה מגיעה תוך כ-2 ימי עסקים, בין השעות 8:00 ל-22:00.

[שאלות קשורות: מתי ההזמנה תגיע? כמה זמן לוקח המשלוח? תוך כמה ימים מגיע המשלוח? זמן אספקה]`;

const CS_CLAUSE = `זמני משלוח: המשלוח מגיע עד 7 ימי עסקים ממועד ביצוע ההזמנה. אין להבטיח זמן אספקה קצר יותר, גם אם מופיע מבצע ישן או פוסט של יוצרת תוכן שמזכיר 3 או 5 ימי עסקים.`;

const FAQ_Q = 'מה זמן המשלוח?';
const FAQ_A = 'המשלוח מגיע עד 7 ימי עסקים ממועד ההזמנה. תקבלי SMS עם מעקב כשהחבילה יוצאת.';

/**
 * Only the order→delivery promise. Anchored on the surrounding words so the
 * SMS→doorstep "2 ימי עסקים" sentence can never match.
 */
const SITE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/משלוח עד 5 ימי עסקים/g, 'משלוח עד 7 ימי עסקים'],
  [/החבילה תישלח אליך באמצעות חברת שילוח עד 5 ימי עסקים/g,
   'החבילה תישלח אליך באמצעות חברת שילוח עד 7 ימי עסקים'],
  // The main promise is now 7 for everyone, so the edge-settlement carve-out
  // (which existed only to name 7) would read as "up to 7, except up to 7".
  [/\n?\*למעט יישובי קצה, שבהם זמן המשלוח עומד על עד 7 ימי עסקים\.\n?/g, '\n'],
  [/החבילה תישלח אליך באמצעות חברת השילוח עד 3 ימי עסקים/g,
   'החבילה תישלח אליך באמצעות חברת השילוח עד 7 ימי עסקים'],
];

/** Replaces the retraction written by set-flat-shipping-policy.ts, rather than stacking a second one. */
const OLD_CORRECTION = `[עדכון מדיניות — נכון ל-${EFFECTIVE_DATE}: אין משלוח חינם. דמי המשלוח הם 25 ₪ לכל הזמנה, ללא תלות בסכום. מבצע משלוח חינם שמוזכר למעלה אינו בתוקף.]`;
const NEW_CORRECTION = `[עדכון מדיניות — נכון ל-${EFFECTIVE_DATE}: אין משלוח חינם. דמי המשלוח הם 25 ₪ לכל הזמנה, ללא תלות בסכום. זמן המשלוח הוא עד 7 ימי עסקים. מבצע משלוח חינם וזמני משלוח קצרים יותר שמוזכרים למעלה אינם בתוקף.]`;

async function updateConfig() {
  const { data: acct, error } = await supabase
    .from('accounts').select('config').eq('id', ACCOUNT_ID).single();
  if (error || !acct) throw new Error(`read config failed: ${error?.message}`);

  const config = JSON.parse(JSON.stringify(acct.config ?? {}));
  const changes: string[] = [];

  const faq = config?.widget?.prompt?.faq;
  if (Array.isArray(faq)) {
    const entry = faq.find((e: { question?: string }) => e?.question === FAQ_Q);
    if (entry && entry.answer !== FAQ_A) {
      changes.push(`widget.prompt.faq "${FAQ_Q}": "${entry.answer}" → "${FAQ_A}"`);
      entry.answer = FAQ_A;
    } else if (!entry) {
      faq.push({ question: FAQ_Q, answer: FAQ_A });
      changes.push(`widget.prompt.faq += "${FAQ_Q}"`);
    }
  }

  const policy: string = config?.whatsapp_cs?.policy ?? '';
  if (!policy.includes('זמני משלוח:')) {
    config.whatsapp_cs = config.whatsapp_cs ?? {};
    config.whatsapp_cs.policy = `${policy.trimEnd()}\n\n${CS_CLAUSE}`.trim();
    changes.push('whatsapp_cs.policy += delivery-time clause');
  }

  if (!changes.length) { log('  config: already correct'); return; }
  for (const c of changes) log(`  · ${c}`);
  if (DRY) return;

  const { error: upErr } = await supabase.from('accounts').update({ config }).eq('id', ACCOUNT_ID);
  if (upErr) throw new Error(`config update failed: ${upErr.message}`);
}

async function upsertPolicyChunk() {
  const { data: existing } = await supabase
    .from('document_chunks').select('id, chunk_text')
    .eq('account_id', ACCOUNT_ID).eq('document_id', POLICY_DOC_ID).eq('topic', TOPIC).maybeSingle();

  if (existing?.chunk_text === POLICY_TEXT) { log('  knowledge_base chunk: already correct'); return; }
  log(`  · knowledge_base chunk (${TOPIC}): ${existing ? 'update' : 'insert'}`);
  if (DRY) return;

  const [embedding] = await generateEmbeddings([POLICY_TEXT]);
  const row = {
    document_id: POLICY_DOC_ID,
    account_id: ACCOUNT_ID,
    entity_type: 'knowledge_base',
    chunk_text: POLICY_TEXT,
    embedding,
    token_count: Math.ceil(POLICY_TEXT.length / 4),
    metadata: { topic: TOPIC, source: `delivery_time_${EFFECTIVE_DATE}` },
    topic: TOPIC,
    chunk_hash: md5(POLICY_TEXT),
  };

  if (existing) {
    const { error } = await supabase.from('document_chunks').update(row).eq('id', existing.id);
    if (error) throw new Error(`chunk update failed: ${error.message}`);
  } else {
    const { data: maxRow } = await supabase
      .from('document_chunks').select('chunk_index').eq('document_id', POLICY_DOC_ID)
      .order('chunk_index', { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from('document_chunks')
      .insert({ ...row, chunk_index: (maxRow?.chunk_index ?? -1) + 1 });
    if (error) throw new Error(`chunk insert failed: ${error.message}`);
    await supabase.from('documents')
      .update({ chunk_count: (maxRow?.chunk_index ?? -1) + 2 }).eq('id', POLICY_DOC_ID);
  }
}

async function fixStaleChunks() {
  const { data: chunks, error } = await supabase
    .from('document_chunks').select('id, entity_type, chunk_text')
    .eq('account_id', ACCOUNT_ID).like('chunk_text', '%ימי עסקים%');
  if (error) throw new Error(`chunk scan failed: ${error.message}`);

  const updates: Array<{ id: string; text: string; kind: string }> = [];
  for (const c of chunks ?? []) {
    if (c.entity_type === 'knowledge_base') continue;

    if (c.entity_type === 'website') {
      let text = c.chunk_text;
      for (const [re, to] of SITE_REPLACEMENTS) text = text.replace(re, to);
      if (text !== c.chunk_text) updates.push({ id: c.id, text, kind: 'website rewrite' });
    } else if (c.chunk_text.includes(OLD_CORRECTION)) {
      updates.push({
        id: c.id,
        text: c.chunk_text.replace(OLD_CORRECTION, NEW_CORRECTION),
        kind: `${c.entity_type} retraction extended`,
      });
    } else if (/\d+\s*ימי עסקים/.test(c.chunk_text) && !c.chunk_text.includes('[עדכון מדיניות')) {
      updates.push({
        id: c.id,
        text: `${c.chunk_text}\n\n${NEW_CORRECTION}`,
        kind: `${c.entity_type} correction`,
      });
    }
  }
  if (!updates.length) { log('  stale chunks: already correct'); return; }

  const byKind = updates.reduce<Record<string, number>>(
    (a, u) => ({ ...a, [u.kind]: (a[u.kind] ?? 0) + 1 }), {});
  for (const [kind, n] of Object.entries(byKind)) log(`  · ${n} × ${kind}`);
  if (DRY) return;

  const embeddings = await generateEmbeddings(updates.map((u) => u.text));
  if (embeddings.length !== updates.length) {
    throw new Error(`embedding count mismatch ${embeddings.length}/${updates.length}`);
  }
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const { error: uErr } = await supabase.from('document_chunks').update({
      chunk_text: u.text,
      embedding: embeddings[i],
      chunk_hash: md5(u.text),
      token_count: Math.ceil(u.text.length / 4),
    }).eq('id', u.id);
    if (uErr) throw new Error(`chunk ${u.id} update failed: ${uErr.message}`);
  }
  log(`  ✓ re-embedded ${updates.length} chunks`);
}

async function main() {
  log(DRY ? '— DRY RUN —\n' : '— APPLYING —\n');
  log(`${LABEL} (${ACCOUNT_ID})`);
  await updateConfig();
  await upsertPolicyChunk();
  await fixStaleChunks();
  log(DRY ? '\nDry run complete — nothing written.' : '\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
