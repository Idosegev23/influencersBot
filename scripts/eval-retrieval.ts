/**
 * RAG Retrieval Evaluation
 *
 * Uses synthetic_queries stored in document_chunks.metadata as ground truth.
 * For each query, runs production retrieveContext() and checks if the
 * source chunk appears in top-k results.
 *
 * Usage:
 *   npx tsx scripts/eval-retrieval.ts <account_id> [--sample N] [--concurrency C] [--out path]
 *
 * Example:
 *   npx tsx scripts/eval-retrieval.ts 4e2a0ce8-8753-4876-973c-00c9e1426e51 --sample 200
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { retrieveContext } from '@/lib/rag/retrieve';
import { createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

type ChunkRow = {
  id: string;
  entity_type: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  metadata: { synthetic_queries?: string[]; [k: string]: unknown };
};

type QueryResult = {
  chunkId: string;
  entityType: string;
  query: string;
  rank: number | null; // 1-based, null if not in top-k
  topSim: number | null;
  returnedCount: number;
  durationMs: number;
  topIds: string[];
};

function parseArgs() {
  const [, , accountId, ...rest] = process.argv;
  if (!accountId) {
    console.error('Usage: npx tsx scripts/eval-retrieval.ts <account_id> [--sample N] [--concurrency C] [--topk K] [--out path]');
    process.exit(1);
  }
  const args = {
    accountId,
    sample: 0, // 0 = all
    concurrency: 4,
    topK: 10,
    out: '',
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--sample') args.sample = parseInt(rest[++i], 10);
    else if (a === '--concurrency') args.concurrency = parseInt(rest[++i], 10);
    else if (a === '--topk') args.topK = parseInt(rest[++i], 10);
    else if (a === '--out') args.out = rest[++i];
  }
  if (!args.out) {
    args.out = `/tmp/eval-retrieval-${args.accountId.slice(0, 8)}-${Date.now()}.json`;
  }
  return args;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx];
}

async function loadChunks(accountId: string): Promise<ChunkRow[]> {
  const supabase = createClient();
  const all: ChunkRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, entity_type, chunk_index, chunk_text, token_count, metadata')
      .eq('account_id', accountId)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ChunkRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all.filter(c => Array.isArray(c.metadata?.synthetic_queries) && c.metadata!.synthetic_queries!.length > 0);
}

async function main() {
  const args = parseArgs();
  console.log(`\n=== RAG Retrieval Eval ===`);
  console.log(`Account:     ${args.accountId}`);
  console.log(`Sample:      ${args.sample || 'ALL'}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`topK:        ${args.topK}`);
  console.log(`Out:         ${args.out}\n`);

  console.log('Loading chunks with synthetic_queries...');
  const chunks = await loadChunks(args.accountId);
  console.log(`Found ${chunks.length} chunks with synthetic_queries`);

  if (args.sample > 0 && chunks.length > args.sample) {
    shuffleInPlace(chunks);
    chunks.length = args.sample;
    console.log(`Sampled down to ${chunks.length}`);
  }

  const pairs: { chunk: ChunkRow; query: string }[] = [];
  for (const c of chunks) {
    for (const q of c.metadata.synthetic_queries!) {
      if (typeof q === 'string' && q.trim()) pairs.push({ chunk: c, query: q.trim() });
    }
  }
  console.log(`Total query→chunk pairs: ${pairs.length}`);
  console.log(`Expected runtime: ~${Math.ceil((pairs.length * 400) / args.concurrency / 1000)}s at ${args.concurrency}x\n`);

  let done = 0;
  const startAll = Date.now();
  const results = await pMap(pairs, args.concurrency, async ({ chunk, query }) => {
    const t0 = Date.now();
    try {
      const r = await retrieveContext({
        accountId: args.accountId,
        query,
        topK: args.topK,
      });
      const ids = r.sources.map(s => s.sourceId);
      const rank0 = ids.indexOf(chunk.id);
      const topSim = r.sources[0]?.confidence ?? null;
      const out: QueryResult = {
        chunkId: chunk.id,
        entityType: chunk.entity_type,
        query,
        rank: rank0 === -1 ? null : rank0 + 1,
        topSim,
        returnedCount: r.sources.length,
        durationMs: Date.now() - t0,
        topIds: ids,
      };
      done++;
      if (done % 25 === 0) {
        const pct = ((done / pairs.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - startAll) / 1000).toFixed(0);
        process.stdout.write(`\r  ${done}/${pairs.length} (${pct}%) — ${elapsed}s elapsed`);
      }
      return out;
    } catch (err: any) {
      done++;
      return {
        chunkId: chunk.id,
        entityType: chunk.entity_type,
        query,
        rank: null,
        topSim: null,
        returnedCount: 0,
        durationMs: Date.now() - t0,
        topIds: [],
        error: err.message,
      } as QueryResult & { error: string };
    }
  });
  console.log(`\n  Done in ${((Date.now() - startAll) / 1000).toFixed(0)}s\n`);

  // === Aggregate ===
  const N = results.length;
  const hits1 = results.filter(r => r.rank !== null && r.rank <= 1).length;
  const hits3 = results.filter(r => r.rank !== null && r.rank <= 3).length;
  const hits5 = results.filter(r => r.rank !== null && r.rank <= 5).length;
  const hits10 = results.filter(r => r.rank !== null && r.rank <= 10).length;
  const misses = results.filter(r => r.rank === null);

  const mrr = results.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / N;
  const durations = results.map(r => r.durationMs).sort((a, b) => a - b);

  // Per-entity breakdown
  const byEntity: Record<string, { n: number; hit5: number; hit10: number; mrr: number }> = {};
  for (const r of results) {
    const e = r.entityType;
    byEntity[e] ||= { n: 0, hit5: 0, hit10: 0, mrr: 0 };
    byEntity[e].n++;
    if (r.rank && r.rank <= 5) byEntity[e].hit5++;
    if (r.rank && r.rank <= 10) byEntity[e].hit10++;
    byEntity[e].mrr += r.rank ? 1 / r.rank : 0;
  }
  for (const e of Object.keys(byEntity)) byEntity[e].mrr /= byEntity[e].n;

  // Dead chunks: chunk_id that NEVER appeared in top-k for any of its own synthetic queries
  const perChunk = new Map<string, { total: number; hits: number; entityType: string }>();
  for (const r of results) {
    const row = perChunk.get(r.chunkId) || { total: 0, hits: 0, entityType: r.entityType };
    row.total++;
    if (r.rank !== null) row.hits++;
    perChunk.set(r.chunkId, row);
  }
  const deadChunks = [...perChunk.entries()].filter(([, v]) => v.hits === 0);

  // === Print report ===
  console.log('═══════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`Total query→chunk pairs: ${N}`);
  console.log(`Unique chunks evaluated: ${perChunk.size}`);
  console.log('');
  console.log('Recall:');
  console.log(`  @1:  ${hits1.toString().padStart(5)} / ${N}  (${((hits1 / N) * 100).toFixed(1)}%)`);
  console.log(`  @3:  ${hits3.toString().padStart(5)} / ${N}  (${((hits3 / N) * 100).toFixed(1)}%)`);
  console.log(`  @5:  ${hits5.toString().padStart(5)} / ${N}  (${((hits5 / N) * 100).toFixed(1)}%)`);
  console.log(`  @10: ${hits10.toString().padStart(5)} / ${N}  (${((hits10 / N) * 100).toFixed(1)}%)`);
  console.log(`  MRR: ${mrr.toFixed(3)}`);
  console.log('');
  console.log('Latency (ms):');
  console.log(`  p50: ${percentile(durations, 50)}`);
  console.log(`  p90: ${percentile(durations, 90)}`);
  console.log(`  p99: ${percentile(durations, 99)}`);
  console.log('');
  console.log('Per entity_type:');
  console.table(
    Object.fromEntries(
      Object.entries(byEntity).map(([k, v]) => [
        k,
        {
          n: v.n,
          'recall@5': `${((v.hit5 / v.n) * 100).toFixed(1)}%`,
          'recall@10': `${((v.hit10 / v.n) * 100).toFixed(1)}%`,
          mrr: v.mrr.toFixed(3),
        },
      ])
    )
  );
  console.log('');
  console.log(`Dead chunks (never retrieved by ANY of their own queries): ${deadChunks.length} / ${perChunk.size} (${((deadChunks.length / perChunk.size) * 100).toFixed(1)}%)`);
  if (deadChunks.length > 0) {
    console.log('Dead by entity_type:');
    const deadByEntity: Record<string, number> = {};
    for (const [, v] of deadChunks) deadByEntity[v.entityType] = (deadByEntity[v.entityType] || 0) + 1;
    console.table(deadByEntity);
  }

  // === Example failures ===
  console.log('\nSample failures (5 random):');
  const missSample = misses.slice(0, 5);
  for (const m of missSample) {
    console.log(`  • [${m.entityType}] "${m.query}" → top=${m.topSim?.toFixed(3) ?? '-'} returned=${m.returnedCount}`);
  }

  // === Write full output ===
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(
    args.out,
    JSON.stringify(
      {
        accountId: args.accountId,
        runAt: new Date().toISOString(),
        config: args,
        summary: {
          pairs: N,
          uniqueChunks: perChunk.size,
          recall: {
            at1: hits1 / N,
            at3: hits3 / N,
            at5: hits5 / N,
            at10: hits10 / N,
          },
          mrr,
          latencyMs: { p50: percentile(durations, 50), p90: percentile(durations, 90), p99: percentile(durations, 99) },
          byEntity,
          deadChunks: deadChunks.map(([id, v]) => ({ id, entityType: v.entityType, queries: v.total })),
        },
        results,
      },
      null,
      2
    )
  );
  console.log(`\nFull results → ${args.out}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
