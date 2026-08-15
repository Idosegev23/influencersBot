#!/usr/bin/env node
/**
 * Ingest data.gov.il (CKAN) datasets into RAG for our government-ministry accounts.
 * Mirrors the RAG insertion pattern from scrape-govil-ministry.mjs.
 *
 * Usage:
 *   node --env-file=.env scripts/ingest-datagov.mjs <key> [options]
 *
 * Keys: civic-service | mod-scholarship | road-safety | all
 *
 * Options:
 *   --dataset <name>   Ingest only one dataset key within the ministry
 *   --limit <n>        Cap rows fetched per dataset (debugging)
 *   --dry-run          Fetch + narrate only — do NOT touch the DB
 *   --skip-rag         Insert document row but skip embeddings/chunks
 *   --clean            Delete prior gov_data documents/chunks for this ministry first
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// CLI parsing
// ============================================
const args = process.argv.slice(2);
const key = args[0];
const getArg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const hasFlag = (n) => args.includes(`--${n}`);

const ONLY_DATASET = getArg('dataset', null);
const ROW_LIMIT = parseInt(getArg('limit', '0'), 10) || null;
const DRY_RUN = hasFlag('dry-run');
const SKIP_RAG = hasFlag('skip-rag');
const CLEAN = hasFlag('clean');

// ============================================
// Per-ministry dataset configs
// ============================================
const INGESTS = {
  'civic-service': {
    accountId: '3498476c-b141-44d2-9b04-b8952882feaa',
    datasets: [
      {
        key: 'ogdan-education',
        resourceId: '9d656232-3329-4e41-bd6f-a793644b4ea6',
        title: 'אוגדן השכלות — תנאי סף במכרזי שירות המדינה',
        sourceUrl: 'https://data.gov.il/dataset/ogdan-education',
        rowsPerChunk: 1,
        narrate: (r) =>
          [
            `מוסד: ${r.institution_name || '-'}`,
            `פקולטה: ${r.Faculty_Name || '-'}`,
            `תחום השכלה: ${r.Field_of_Education || '-'}`,
            `רמת תואר: ${r.Degree_level || '-'}`,
            `צירוף חד/דו-חוגי: ${r.One_Two_Combo || '-'}`,
            `תואר זר מקביל: ${r.Parallel_Foreign_Degree || '-'}`,
            `המלצות השמה: ${r.Placement_recommendations || '-'}`,
            `עדכונים: ${r.Regular_updates || '-'}`,
            `עולמות תוכן: ${r.Content_worlds || '-'}`,
            r.Explanations ? `הסבר: ${r.Explanations}` : null,
          ]
            .filter(Boolean)
            .join('. '),
      },
      {
        key: 'recruitment',
        resourceId: '009fd03b-17fd-4958-83a9-25f256ca3fb6',
        title: 'נתוני גיוס לשירות המדינה 2019-2024',
        sourceUrl: 'https://data.gov.il/dataset/recruitment',
        rowsPerChunk: 8,
        narrate: (r) =>
          `מכרז ${r['מספר מכרז'] || '-'} (${r['שנת פרסום'] || '-'}): "${r['שם משרה'] || r['שם עיסוק'] || '-'}" במשרד ${r['שם משרד'] || '-'}, יחידה ${r['שם יחידה ארגונית'] || '-'}, יישוב ${r['יישוב המשרה'] || '-'} (אזור ${r['אזור'] || '-'}). סוג: ${r['סוג מכרז'] || '-'}, סטטוס: ${r['סטטוס מכרז'] || '-'} (${r['סיבת סטטוס מכרז'] || '-'}). דירוג ${r['דרוג משרה'] || '-'}, מתח דרגות ${r['מתח דרגות'] || '-'}, אחוז משרה ${r['אחוז משרה'] || '-'}%. כמות משרות לאיוש: ${r['כמות משרות לאיוש'] || '-'}. מועמדים שהגישו: ${r['מספר מועמדים שהגישו מועמדות למשרה'] || '-'}.`,
      },
    ],
  },
  'mod-scholarship': {
    accountId: '24e32cd7-e4be-40d1-bc7a-93850f94df0c',
    datasets: [
      {
        key: 'hayalim',
        resourceId: 'a0bdb3c2-d3ac-494f-a193-811791066f01',
        title: 'איתור קורסים מאושרים למוסדות — חיילים משוחררים',
        sourceUrl: 'https://data.gov.il/dataset/hayalim',
        rowsPerChunk: 6,
        narrate: (r) =>
          `קורס "${(r.course || '').trim() || '-'}" במוסד "${(r.institution || '').trim() || '-'}". כתובת: ${r.address || '-'}, עיר: ${r.city || '-'}, מחוז: ${r.district || '-'}. טלפון: ${r.telephone || '-'}, מייל: ${r.email || '-'}.`,
      },
    ],
  },
  'road-safety': {
    accountId: 'bf4ac294-d274-4c66-a080-935e44b61c63',
    datasets: [
      {
        key: 'accidents_municipal',
        resourceId: 'b17b1634-c001-4d37-96c6-a661b2ecd98c',
        title: 'תאונות דרכים לפי רשות מוניציפלית (חודשי)',
        sourceUrl: 'https://data.gov.il/dataset/accidents_municipal',
        rowsPerChunk: 4,
        narrate: (r) => {
          const ym = String(r.YEARMONTH || '');
          const year = ym.slice(0, 4) || '-';
          const mon = ym.slice(4, 6) || '-';
          return `${r.CITY || '-'} (${r.MUNITYPE || '-'}, מחוז ${r.DISTRICT || '-'}), ${mon}/${year}: ${r.SUMACCIDEN ?? '-'} תאונות. הרוגים: ${r.DEAD ?? '-'}. פצועים קשה: ${r.SEVER_INJ ?? '-'}. פצועים קל: ${r.SLIGH_INJ ?? '-'}. הולכי רגל שנפגעו: ${r.PEDESTRINJ ?? '-'}. גילאים — 0-19: ${r.INJ0_19 ?? '-'}, 20-64: ${r.INJ20_64 ?? '-'}, 65+: ${r.INJ65_ ?? '-'}. סה"כ נפגעים: ${r.INJTOTAL ?? '-'}. רכבים מעורבים: ${r.TOTDRIVERS ?? '-'} (פרטי ${r.PRIVATE ?? '-'}, אופנוע ${r.MOTORCYCLE ?? '-'}, משאית ${r.TRUCK ?? '-'}, אופניים ${r.BICYCLE ?? '-'}). מדד תאונות (ACC_INDEX): ${r.ACC_INDEX ?? '-'}.`;
        },
      },
    ],
  },
};

if (!key || (!INGESTS[key] && key !== 'all')) {
  console.log('Usage: node --env-file=.env scripts/ingest-datagov.mjs <key> [options]');
  console.log('Keys: civic-service | mod-scholarship | road-safety | all');
  process.exit(1);
}

// ============================================
// Env + Supabase
// ============================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}
if (!DRY_RUN && !SKIP_RAG && !OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY (or use --skip-rag)');
  process.exit(1);
}

const supabase = DRY_RUN
  ? null
  : createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ============================================
// data.gov.il fetcher (paginated)
// ============================================
const CKAN_BASE = 'https://data.gov.il/api/3/action';
const PAGE_SIZE = 1000;

async function fetchPageWithRetry(resourceId, offset, attempts = 5) {
  let lastErr = null;
  for (let a = 1; a <= attempts; a++) {
    try {
      const url = `${CKAN_BASE}/datastore_search?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(`CKAN failure: ${JSON.stringify(json.error)}`);
      return json.result;
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, a - 1); // 1s, 2s, 4s, 8s, 16s
      console.warn(`    page offset=${offset} attempt ${a} failed (${e.message}); retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`CKAN page offset=${offset} failed after ${attempts} attempts: ${lastErr?.message}`);
}

async function fetchAllRecords(resourceId, cap = null) {
  const rows = [];
  let offset = 0;
  let total = null;
  while (true) {
    const result = await fetchPageWithRetry(resourceId, offset);
    const records = result.records || [];
    if (total === null) total = result.total;
    rows.push(...records);
    if (records.length < PAGE_SIZE) break;
    if (cap && rows.length >= cap) break;
    offset += PAGE_SIZE;
    // be gentle on gov.il — strict undocumented rate limits
    await new Promise((r) => setTimeout(r, 300));
  }
  return { rows: cap ? rows.slice(0, cap) : rows, total };
}

async function fetchResourceMeta(resourceId, attempts = 5) {
  let lastErr = null;
  for (let a = 1; a <= attempts; a++) {
    try {
      const url = `${CKAN_BASE}/datastore_search?resource_id=${resourceId}&limit=0`;
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(`CKAN failure: ${JSON.stringify(json.error)}`);
      return {
        total: json.result.total,
        fields: (json.result.fields || []).filter((f) => !f.id.startsWith('_')).map((f) => f.id),
      };
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, a - 1);
      console.warn(`    meta attempt ${a} failed (${e.message}); retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  console.error(`  meta fetch failed after ${attempts} attempts: ${lastErr?.message}`);
  return null;
}

// ============================================
// Chunker (mirrors scrape-govil-ministry.mjs)
// ============================================
function chunkText(text, maxChars = 1400, overlap = 120) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      const lp = text.lastIndexOf('.', end);
      const ln = text.lastIndexOf('\n', end);
      const bp = Math.max(lp, ln);
      if (bp > start + maxChars * 0.5) end = bp + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece.length > 20) chunks.push(piece);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// Group narrated rows into chunk-sized buckets — each bucket joined with newlines.
function groupNarrationsToChunks(narrations, rowsPerChunk) {
  const out = [];
  for (let i = 0; i < narrations.length; i += rowsPerChunk) {
    const chunk = narrations.slice(i, i + rowsPerChunk).join('\n');
    if (chunk.trim().length > 20) out.push({ text: chunk, firstRow: i, lastRow: Math.min(i + rowsPerChunk - 1, narrations.length - 1) });
  }
  return out;
}

// ============================================
// Embeddings (2000-dim, mirrors scrape-govil-ministry.mjs)
// ============================================
async function getEmbeddingBatch(texts) {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        dimensions: 2000,
        input: texts.map((t) => t.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      console.error(`  Embedding err: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json();
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (e) {
    console.error(`  Embedding ex: ${e.message}`);
    return null;
  }
}

// ============================================
// DB ops
// ============================================
// We use entity_type='knowledge_base' (allowed by documents_entity_type_check) and
// tag the source with metadata.source='data.gov.il' so these rows can be filtered
// distinctly from website / post / etc. content.
const ENTITY_TYPE = 'knowledge_base';
const SOURCE_TAG = 'data.gov.il';

async function deleteExistingDocument(accountId, sourceId) {
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', accountId)
    .eq('entity_type', ENTITY_TYPE)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (existing) {
    await supabase.from('document_chunks').delete().eq('document_id', existing.id);
    await supabase.from('documents').delete().eq('id', existing.id);
    return true;
  }
  return false;
}

async function cleanAllGovData(accountId) {
  console.log(`  Cleaning prior data.gov.il documents for ${accountId}...`);
  const { data: docs } = await supabase
    .from('documents')
    .select('id, source_id, metadata')
    .eq('account_id', accountId)
    .eq('entity_type', ENTITY_TYPE)
    .like('source_id', 'data.gov.il:%');
  if (docs && docs.length > 0) {
    for (const d of docs) await supabase.from('document_chunks').delete().eq('document_id', d.id);
    for (const d of docs) await supabase.from('documents').delete().eq('id', d.id);
    console.log(`    Deleted ${docs.length} data.gov.il documents`);
  }
}

// ============================================
// Per-dataset ingest
// ============================================
async function ingestDataset(accountId, ds) {
  const sourceId = `data.gov.il:${ds.resourceId}`;
  console.log(`\n--- ${ds.key} (${ds.resourceId}) ---`);

  const meta = await fetchResourceMeta(ds.resourceId);
  if (!meta) {
    console.error('  Could not fetch resource metadata');
    return { ok: false, dataset: ds.key };
  }
  console.log(`  rows in datastore: ${meta.total}`);
  if (ROW_LIMIT) console.log(`  applying --limit ${ROW_LIMIT}`);

  console.log('  fetching rows...');
  const { rows } = await fetchAllRecords(ds.resourceId, ROW_LIMIT);
  console.log(`  fetched ${rows.length} rows`);

  const narrations = rows
    .map(ds.narrate)
    .map((t) => (t || '').trim())
    .filter((t) => t.length > 10);
  console.log(`  narrated ${narrations.length} rows`);

  const grouped = groupNarrationsToChunks(narrations, ds.rowsPerChunk || 1);
  console.log(`  grouped into ${grouped.length} chunks (rowsPerChunk=${ds.rowsPerChunk || 1})`);

  if (DRY_RUN) {
    console.log(`  [dry-run] sample chunk:\n${grouped[0]?.text.slice(0, 500) || '(empty)'}\n  ...`);
    return { ok: true, dataset: ds.key, chunks: grouped.length };
  }

  await deleteExistingDocument(accountId, sourceId);

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      entity_type: ENTITY_TYPE,
      source_id: sourceId,
      title: ds.title,
      status: 'active',
      metadata: {
        source: SOURCE_TAG,
        dataset_key: ds.key,
        resource_id: ds.resourceId,
        source_url: ds.sourceUrl,
        row_count: rows.length,
        total_in_datastore: meta.total,
        fields: meta.fields,
        ingested_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();
  if (docErr) {
    console.error(`  RAG doc err: ${docErr.message}`);
    return { ok: false, dataset: ds.key };
  }

  if (SKIP_RAG) {
    console.log('  [skip-rag] document created without chunks');
    return { ok: true, dataset: ds.key, chunks: 0 };
  }

  let created = 0;
  for (let i = 0; i < grouped.length; i += 20) {
    const batch = grouped.slice(i, i + 20);
    const texts = batch.map((b) => b.text);
    const embeddings = await getEmbeddingBatch(texts);
    if (!embeddings) {
      console.error(`  embedding batch failed at ${i}, skipping`);
      continue;
    }
    const inserts = batch.map((b, j) => ({
      document_id: doc.id,
      account_id: accountId,
      entity_type: ENTITY_TYPE,
      chunk_index: i + j,
      chunk_text: b.text,
      embedding: embeddings[j],
      token_count: Math.ceil(b.text.length / 4),
      metadata: {
        source: SOURCE_TAG,
        dataset_key: ds.key,
        source_url: ds.sourceUrl,
        first_row: b.firstRow,
        last_row: b.lastRow,
      },
    }));
    const { error } = await supabase.from('document_chunks').insert(inserts);
    if (error) console.error(`  chunk insert err at batch ${i}: ${error.message}`);
    else created += inserts.length;
    if ((i / 20) % 10 === 0) console.log(`    progress: ${created}/${grouped.length} chunks`);
  }

  await supabase
    .from('documents')
    .update({ chunk_count: created, total_tokens: Math.ceil(narrations.join('').length / 4) })
    .eq('id', doc.id);

  console.log(`  ✓ ingested ${created} chunks`);
  return { ok: true, dataset: ds.key, chunks: created };
}

// ============================================
// Main
// ============================================
(async () => {
  const t0 = Date.now();
  const keys = key === 'all' ? Object.keys(INGESTS) : [key];
  const results = {};

  for (const k of keys) {
    const conf = INGESTS[k];
    console.log(`\n===== ${k} (account ${conf.accountId}) =====`);

    if (CLEAN && !DRY_RUN) await cleanAllGovData(conf.accountId);

    const datasets = ONLY_DATASET ? conf.datasets.filter((d) => d.key === ONLY_DATASET) : conf.datasets;
    if (datasets.length === 0) {
      console.log(`  no datasets matching --dataset ${ONLY_DATASET}, skipping`);
      continue;
    }

    results[k] = [];
    for (const ds of datasets) {
      try {
        const r = await ingestDataset(conf.accountId, ds);
        results[k].push(r);
      } catch (e) {
        console.error(`  dataset ${ds.key} failed: ${e.message}`);
        results[k].push({ ok: false, dataset: ds.key, error: e.message });
      }
    }
  }

  console.log(`\n============================================`);
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(JSON.stringify(results, null, 2));
})();
