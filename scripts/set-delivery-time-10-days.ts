/**
 * Delivery time is 10 business days — for ARGANIA, LA BEAUTÉ and STUDIO PASHA.
 *
 * The brands moved to a single order→delivery promise of "עד 10 ימי עסקים".
 * Our data still carries every earlier answer, and each one is reachable by the bot:
 *   "עד 3 ימי עסקים"    — old Studio Pasha FAQ chunks + widget FAQ
 *   "תוך 3-5 ימי עסקים" — LA BEAUTÉ's seeded policy chunks (Focus)
 *   "עד 5 ימי עסקים"    — scraped shipping-policy / product pages
 *   "עד 7 ימי עסקים"    — what scripts/set-studiopasha-delivery-time.ts wrote in 09/2026
 *
 * Surfaces, in order of how directly a customer hits them (same map as
 * scripts/set-flat-shipping-policy.ts):
 *   1. config.widget.prompt.faq                          — answered in the widget verbatim
 *   2. config.whatsapp_cs.policy                         — injected into the CS brain (WA + web CS)
 *   3. config.shipment_provider.delivery_eta_business_days — the number the tracking tab shows
 *   4. knowledge_base RAG chunk (topic=shipping_time)    — authoritative, survives a re-scan
 *   5. sibling knowledge_base chunks                     — LA BEAUTÉ's where_is_my_order also
 *                                                          quotes 3-5 / 5 days
 *   6. stale scraped + creator chunks                    — site chrome, posts, transcripts
 *
 * Scrub rule, unchanged from the two earlier scripts: site chrome and our own seeded
 * knowledge are rewritten in place; a creator's real words keep their wording and carry
 * a dated retraction instead, so the bot sees the correction next to the claim.
 *
 * NOT touched, deliberately — these are different facts that also count days:
 *   "מרגע קבלת ה-SMS החבילה מגיעה תוך כ-2 ימי עסקים"  (courier hand-off → doorstep)
 *   "הטיפול בדרך כלל תוך 1-2 ימי עסקים"                (ticket handling)
 *   "הצוות חוזר תוך יום עסקים אחד"                     (support response)
 * Rewriting every "N ימי עסקים" would corrupt all three, so each line must name a
 * shipping context and must not name one of those, before any number moves.
 *
 * Idempotent. Run:
 *   npx tsx scripts/set-delivery-time-10-days.ts --dry-run
 *   npx tsx scripts/set-delivery-time-10-days.ts
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });
import { createClient } from '@supabase/supabase-js';
import { generateEmbeddings } from '../src/lib/rag/embeddings';
import {
  CORRECTION_RE, HAS_CORRECTION, MENTIONS_DAYS, SHIPPING_CONTEXT, rewriteDeliveryTime as rewrite,
} from './lib/delivery-eta';
import crypto from 'crypto';

const DRY = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
if (!SUPABASE_URL || !SECRET_KEY || !process.env.OPENAI_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / OPENAI_API_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SECRET_KEY);

const DAYS = 10;
const EFFECTIVE_DATE = '03/09/2026';
const TOPIC = 'shipping_time';

type Brand = {
  accountId: string;
  label: string;
  policyDocId: string;
  policyDocTitle: string;
  /** Brand-specific tail of the canonical chunk: what happens after the order ships. */
  carrierNote: string;
};

const BRANDS: Brand[] = [
  {
    accountId: 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1',
    label: 'ARGANIA',
    policyDocId: '00000000-0000-0000-0000-000000000011',
    policyDocTitle: 'ARGANIA — Service Policy Knowledge',
    carrierNote: 'כשההזמנה יוצאת מהמחסן נשלחת הודעת מעקב מחברת השילוח.',
  },
  {
    accountId: '432dea15-707f-4cfe-b7e2-331c7a02b228',
    label: 'LA BEAUTÉ',
    // Pre-existing doc from scripts/seed-labeaute-policy-chunks.ts — its shipping_time
    // chunk is updated in place; the 7 sibling policy chunks are never wiped.
    policyDocId: '00000000-0000-0000-0000-000000000001',
    policyDocTitle: 'LA BEAUTÉ — Service Policy Knowledge',
    carrierNote:
      'המשלוחים מתבצעים דרך חברת Focus. כשההזמנה יוצאת למשלוח מגיע מייל מ-Focus עם מספר משלוח (7 ספרות) למעקב, ואפשר לבדוק סטטוס בטאב "סטטוס משלוח" כאן בצ\'אט.',
  },
  {
    accountId: '36705ad6-4f82-46af-95e1-fb5ea6f4a44f',
    label: 'STUDIO PASHA',
    policyDocId: '00000000-0000-0000-0000-000000000012',
    policyDocTitle: 'STUDIO PASHA — Service Policy Knowledge',
    carrierNote:
      'לאחר שהחבילה יוצאת מהמחסן נשלחת הודעת SMS מחברת השילוח עם מעקב, ומרגע קבלת ה-SMS החבילה מגיעה תוך כ-2 ימי עסקים, בין השעות 8:00 ל-22:00.',
  },
];

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
const log = (...a: unknown[]) => console.log(...a);

function policyChunk(brand: Brand): string {
  return `זמני משלוח ${brand.label}:
המשלוח מגיע עד ${DAYS} ימי עסקים ממועד ביצוע ההזמנה.
זה הזמן המחייב — אם מופיע בתוכן ישן, בפוסט של יוצרת תוכן או בדף באתר זמן קצר יותר (3, 5 או 7 ימי עסקים), הוא אינו בתוקף.
${brand.carrierNote}

[שאלות קשורות: מתי ההזמנה תגיע? כמה זמן לוקח המשלוח? תוך כמה ימים מגיע המשלוח? זמן אספקה]`;
}

const CS_CLAUSE = `זמני משלוח: המשלוח מגיע עד ${DAYS} ימי עסקים ממועד ביצוע ההזמנה. אין להבטיח זמן אספקה קצר יותר, גם אם מופיע בתוכן ישן, במבצע ישן או בפוסט של יוצרת תוכן זמן של 3, 5 או 7 ימי עסקים.`;

const FAQ_Q = 'מה זמן המשלוח?';
const FAQ_A = `המשלוח מגיע עד ${DAYS} ימי עסקים ממועד ההזמנה. תקבלי הודעת מעקב כשהחבילה יוצאת מהמחסן.`;

/**
 * Replaces — never stacks on — the retraction written by set-flat-shipping-policy.ts
 * and extended by set-studiopasha-delivery-time.ts. Both had this exact shape, so one
 * pattern refreshes either, and re-running matches the new text and changes nothing.
 * The ₪25 sentence is carried over so refreshing the bracket loses no earlier fact.
 */
const CORRECTION = `[עדכון מדיניות — נכון ל-${EFFECTIVE_DATE}: זמן המשלוח הוא עד ${DAYS} ימי עסקים ממועד ההזמנה. אין משלוח חינם — דמי המשלוח הם 25 ₪ לכל הזמנה, ללא תלות בסכום. מבצע משלוח חינם וזמני משלוח קצרים יותר שמוזכרים למעלה אינם בתוקף.]`;

// ------------------------------------------------------------- the scrub rule
//
// The line-level rule lives in ./lib/delivery-eta.ts, with its tests in
// tests/unit/delivery-eta-scrub.test.ts — over-matching there would silently
// corrupt the SMS→doorstep and ticket-handling sentences in the same chunks.

const rewriteDeliveryTime = (text: string) => rewrite(text, DAYS);

// ------------------------------------------------------------------- 1-3. config

async function updateConfig(brand: Brand) {
  const { data: acct, error } = await supabase
    .from('accounts').select('config').eq('id', brand.accountId).single();
  if (error || !acct) throw new Error(`${brand.label}: read config failed: ${error?.message}`);

  const config = JSON.parse(JSON.stringify(acct.config ?? {}));
  const changes: string[] = [];

  // 1. widget FAQ — the answer a customer reads without the model in the loop.
  const faq = config?.widget?.prompt?.faq;
  if (Array.isArray(faq)) {
    for (const entry of faq) {
      if (typeof entry?.answer !== 'string') continue;
      if (entry.question === FAQ_Q) continue; // handled below, in full
      const next = rewriteDeliveryTime(entry.answer);
      if (next !== entry.answer) {
        changes.push(`widget.prompt.faq "${entry.question}": "${entry.answer}" → "${next}"`);
        entry.answer = next;
      }
    }
    const entry = faq.find((e: { question?: string }) => e?.question === FAQ_Q);
    if (entry && entry.answer !== FAQ_A) {
      changes.push(`widget.prompt.faq "${FAQ_Q}": "${entry.answer}" → "${FAQ_A}"`);
      entry.answer = FAQ_A;
    } else if (!entry) {
      faq.push({ question: FAQ_Q, answer: FAQ_A });
      changes.push(`widget.prompt.faq += "${FAQ_Q}"`);
    }
  }

  // 2. CS policy — injected verbatim into the CS brain. STUDIO PASHA already carries a
  // "זמני משלוח:" clause naming 7 days, so replace that clause rather than appending a
  // second one that contradicts it.
  const policyText: string = typeof config?.whatsapp_cs?.policy === 'string'
    ? config.whatsapp_cs.policy : '';
  const nextPolicy = /^זמני משלוח:.*$/m.test(policyText)
    ? policyText.replace(/^זמני משלוח:.*$/m, CS_CLAUSE)
    : (policyText.trim()
        ? `${policyText.trimEnd()}\n\n${CS_CLAUSE}`
        : `מדיניות שירות לקוחות — ${brand.label}\n\n${CS_CLAUSE}`);
  if (nextPolicy !== policyText) {
    config.whatsapp_cs = config.whatsapp_cs ?? {};
    config.whatsapp_cs.policy = nextPolicy;
    changes.push(policyText.includes('זמני משלוח:')
      ? 'whatsapp_cs.policy: delivery-time clause → 10 days'
      : 'whatsapp_cs.policy += delivery-time clause');
  }

  // 3. The tracking tab tells a customer when it is worth opening a ticket. That
  // number has to be the delivery promise, not a hard-coded 5 (see BrandSupportTab).
  if (config?.shipment_provider && typeof config.shipment_provider === 'object') {
    if (config.shipment_provider.delivery_eta_business_days !== DAYS) {
      changes.push(
        `shipment_provider.delivery_eta_business_days: ${config.shipment_provider.delivery_eta_business_days ?? '(unset)'} → ${DAYS}`,
      );
      config.shipment_provider.delivery_eta_business_days = DAYS;
    }
  }

  if (!changes.length) { log('  config: already correct'); return; }
  for (const c of changes) log(`  · ${c}`);
  if (DRY) return;

  const { error: upErr } = await supabase
    .from('accounts').update({ config }).eq('id', brand.accountId);
  if (upErr) throw new Error(`${brand.label}: config update failed: ${upErr.message}`);
}

// --------------------------------------------------------- 4. authoritative chunk

async function upsertPolicyChunk(brand: Brand) {
  const text = policyChunk(brand);

  const { data: existing } = await supabase
    .from('document_chunks').select('id, chunk_text')
    .eq('account_id', brand.accountId).eq('document_id', brand.policyDocId)
    .eq('topic', TOPIC).maybeSingle();

  if (existing?.chunk_text === text) { log('  knowledge_base chunk: already correct'); return existing?.id; }
  log(`  · knowledge_base chunk (${TOPIC}): ${existing ? 'update' : 'insert'}`);
  if (DRY) return existing?.id;

  const [embedding] = await generateEmbeddings([text]);

  // Parent doc must exist for the FK. Never wipe siblings.
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
    metadata: { topic: TOPIC, source: `delivery_time_${EFFECTIVE_DATE}` },
    topic: TOPIC,
    chunk_hash: md5(text),
  };

  if (existing) {
    const { error } = await supabase.from('document_chunks').update(row).eq('id', existing.id);
    if (error) throw new Error(`${brand.label}: chunk update failed: ${error.message}`);
    return existing.id;
  }
  const { data: maxRow } = await supabase
    .from('document_chunks').select('chunk_index').eq('document_id', brand.policyDocId)
    .order('chunk_index', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from('document_chunks')
    .insert({ ...row, chunk_index: (maxRow?.chunk_index ?? -1) + 1 });
  if (error) throw new Error(`${brand.label}: chunk insert failed: ${error.message}`);
  return undefined;
}

// ------------------------------------------------------- 5-6. everything else

async function fixStaleChunks(brand: Brand, canonicalId?: string) {
  const { data: chunks, error } = await supabase
    .from('document_chunks').select('id, entity_type, chunk_text')
    .eq('account_id', brand.accountId).like('chunk_text', '%ימי %');
  if (error) throw new Error(`${brand.label}: chunk scan failed: ${error.message}`);

  const updates: Array<{ id: string; text: string; kind: string }> = [];
  const unhandled: string[] = [];

  for (const c of chunks ?? []) {
    if (c.id === canonicalId) continue;
    if (!MENTIONS_DAYS.test(c.chunk_text) && !HAS_CORRECTION.test(c.chunk_text)) continue;

    // Our own seeded knowledge and scraped site chrome: rewrite in place. Both are
    // ours-or-the-brand's wording, and a re-scan of the corrected site converges here.
    if (c.entity_type === 'knowledge_base' || c.entity_type === 'website') {
      const text = rewriteDeliveryTime(c.chunk_text).replace(CORRECTION_RE, CORRECTION);
      if (text !== c.chunk_text) {
        updates.push({ id: c.id, text, kind: `${c.entity_type} rewrite` });
      } else if (MENTIONS_DAYS.test(c.chunk_text) && !new RegExp(`${DAYS} ימי`).test(c.chunk_text)) {
        // Names days in a shape the anchored patterns do not cover — do not guess.
        unhandled.push(c.id);
      }
      continue;
    }

    // A creator's real words in a post or a transcript. Keep the quote, refresh or
    // attach the dated retraction so the bot reads the correction beside the claim.
    if (HAS_CORRECTION.test(c.chunk_text)) {
      const text = c.chunk_text.replace(CORRECTION_RE, CORRECTION);
      if (text !== c.chunk_text) {
        updates.push({ id: c.id, text, kind: `${c.entity_type} retraction refreshed` });
      }
      continue;
    }
    if (MENTIONS_DAYS.test(c.chunk_text) && SHIPPING_CONTEXT.test(c.chunk_text)) {
      updates.push({
        id: c.id,
        text: `${c.chunk_text}\n\n${CORRECTION}`,
        kind: `${c.entity_type} correction`,
      });
    }
  }

  if (unhandled.length) {
    log(`  ! ${unhandled.length} chunk(s) name a day count in an unrecognised shape — review by hand:`);
    for (const id of unhandled) log(`      ${id}`);
  }
  if (!updates.length) { log('  stale chunks: already correct'); return; }

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
    const canonicalId = await upsertPolicyChunk(brand);
    await fixStaleChunks(brand, canonicalId);
    log('');
  }
  log(DRY ? 'Dry run complete — nothing written.' : 'Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
