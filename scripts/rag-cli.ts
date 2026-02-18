#!/usr/bin/env npx tsx
/**
 * RAG CLI
 *
 * Commands:
 *   npx tsx scripts/rag-cli.ts ingest --account <id> [--types post,transcription,...]
 *   npx tsx scripts/rag-cli.ts ingest-file --account <id> --file <path> --title <title> --type <entity_type>
 *   npx tsx scripts/rag-cli.ts ask --account <id> --query "your question"
 *   npx tsx scripts/rag-cli.ts eval --account <id> --dataset <path>
 *   npx tsx scripts/rag-cli.ts stats --account <id>
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { readFileSync, existsSync } from 'fs';
import {
  ingestDocument,
  ingestAllForAccount,
  answerQuestion,
  retrieveContext,
} from '../src/lib/rag';
import type { EntityType } from '../src/lib/rag';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function requireArg(name: string): string {
  const val = getArg(name);
  if (!val) {
    console.error(`Missing required argument: --${name}`);
    process.exit(1);
  }
  return val;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function main() {
  switch (command) {
    case 'ingest': {
      const accountId = requireArg('account');
      const typesArg = getArg('types');
      const entityTypes = typesArg
        ? (typesArg.split(',') as EntityType[])
        : undefined;

      console.log(`\nIngesting content for account: ${accountId}`);
      if (entityTypes) console.log(`Entity types: ${entityTypes.join(', ')}`);
      console.log('---');

      const result = await ingestAllForAccount(accountId, { entityTypes });

      console.log('\nIngestion Results:');
      console.log(`  Total documents: ${result.total}`);
      for (const [type, count] of Object.entries(result.byType)) {
        console.log(`  ${type}: ${count}`);
      }
      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        result.errors.forEach(e => console.log(`  - ${e}`));
      }
      break;
    }

    case 'ingest-file': {
      const accountId = requireArg('account');
      const filePath = requireArg('file');
      const title = requireArg('title');
      const entityType = (getArg('type') || 'document') as EntityType;

      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const text = readFileSync(filePath, 'utf-8');
      console.log(`\nIngesting file: ${filePath}`);
      console.log(`  Title: ${title}`);
      console.log(`  Type: ${entityType}`);
      console.log(`  Size: ${text.length} characters`);
      console.log('---');

      const result = await ingestDocument({
        accountId,
        entityType,
        title,
        text,
      });

      console.log('\nResult:');
      console.log(`  Document ID: ${result.documentId}`);
      console.log(`  Chunks created: ${result.chunksCreated}`);
      console.log(`  Total tokens: ${result.totalTokens}`);
      console.log(`  Duration: ${result.durationMs}ms`);
      break;
    }

    case 'ask': {
      const accountId = requireArg('account');
      const query = requireArg('query');

      console.log(`\nQuestion: "${query}"`);
      console.log(`Account: ${accountId}`);
      console.log('---\n');

      const result = await answerQuestion({ accountId, query });

      console.log('Answer:');
      console.log(result.answer);
      console.log('\n---');
      console.log(`Sources (${result.sources.length}):`);
      for (const source of result.sources) {
        console.log(`  [${source.sourceId.substring(0, 8)}] (${source.entityType}) ${source.title}`);
        console.log(`    Confidence: ${source.confidence.toFixed(3)}`);
      }
      console.log('\nDebug:');
      console.log(`  Query type: ${result.debug.queryType}`);
      console.log(`  Candidates: ${result.debug.candidateCount}`);
      console.log(`  Duration: ${result.debug.durationMs}ms`);
      console.log(`  Stages: classify=${result.debug.stages.classificationMs}ms vector=${result.debug.stages.vectorSearchMs}ms rerank=${result.debug.stages.rerankMs}ms`);
      break;
    }

    case 'eval': {
      const accountId = requireArg('account');
      const datasetPath = getArg('dataset');

      // Default evaluation questions if no dataset
      let questions: Array<{ query: string; expectedType?: string }>;

      if (datasetPath && existsSync(datasetPath)) {
        questions = JSON.parse(readFileSync(datasetPath, 'utf-8'));
      } else {
        questions = [
          { query: 'What coupons are available?', expectedType: 'coupon' },
          { query: 'Tell me about brand partnerships', expectedType: 'partnership' },
          { query: 'What are the most popular posts?', expectedType: 'post' },
          { query: 'What did she say in her latest video?', expectedType: 'transcription' },
          { query: 'What topics does the influencer cover?', expectedType: 'post' },
        ];
      }

      console.log(`\nEvaluating ${questions.length} queries for account: ${accountId}\n`);

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`--- Query ${i + 1}/${questions.length} ---`);
        console.log(`Q: ${q.query}`);

        const result = await answerQuestion({ accountId, query: q.query });

        console.log(`A: ${result.answer.substring(0, 200)}${result.answer.length > 200 ? '...' : ''}`);
        console.log(`Sources: ${result.sources.length}`);
        console.log(`No info: ${result.noSourcesFound}`);

        // Check if answer cites sources
        const citesSources = result.sources.some(s =>
          result.answer.includes(s.sourceId.substring(0, 8))
        );
        console.log(`Cites sources: ${citesSources}`);

        // Check if right entity type was retrieved
        if (q.expectedType) {
          const hasExpectedType = result.sources.some(s => s.entityType === q.expectedType);
          console.log(`Expected type (${q.expectedType}): ${hasExpectedType ? 'PASS' : 'MISS'}`);
        }

        console.log(`Duration: ${result.debug.durationMs}ms`);
        console.log('');
      }
      break;
    }

    case 'stats': {
      const accountId = requireArg('account');
      const supabase = getSupabase();

      const { data: docs, count: docCount } = await supabase
        .from('documents')
        .select('entity_type', { count: 'exact' })
        .eq('account_id', accountId)
        .eq('status', 'active');

      const { count: chunkCount } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId);

      console.log(`\nRAG Stats for account: ${accountId}`);
      console.log(`  Total documents: ${docCount || 0}`);
      console.log(`  Total chunks: ${chunkCount || 0}`);

      if (docs) {
        const byType: Record<string, number> = {};
        for (const d of docs) {
          byType[d.entity_type] = (byType[d.entity_type] || 0) + 1;
        }
        console.log(`\n  By type:`);
        for (const [type, count] of Object.entries(byType)) {
          console.log(`    ${type}: ${count}`);
        }
      }
      break;
    }

    default:
      console.log(`
RAG CLI - Retrieval-Augmented Generation Pipeline

Usage:
  npx tsx scripts/rag-cli.ts <command> [options]

Commands:
  ingest        Ingest all content for an account
                --account <id>  Account ID (required)
                --types <list>  Comma-separated entity types (optional)

  ingest-file   Ingest a single file
                --account <id>  Account ID (required)
                --file <path>   File path (required)
                --title <text>  Document title (required)
                --type <type>   Entity type (default: document)

  ask           Ask a question using the RAG pipeline
                --account <id>  Account ID (required)
                --query <text>  Question text (required)

  eval          Run evaluation queries
                --account <id>  Account ID (required)
                --dataset <path> JSON file with queries (optional)

  stats         Show RAG statistics for an account
                --account <id>  Account ID (required)
      `);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
