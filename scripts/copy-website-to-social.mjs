#!/usr/bin/env node
/**
 * Copy website data from a website account into a social (Instagram) account.
 * Copies pages from instagram_bio_websites and re-ingests RAG chunks.
 *
 * Usage:
 *   node --env-file=.env.local scripts/copy-website-to-social.mjs <from-account-id> <to-account-id>
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const [fromAccountId, toAccountId] = process.argv.slice(2);
if (!fromAccountId || !toAccountId) {
  console.error('Usage: node scripts/copy-website-to-social.mjs <from-account-id> <to-account-id>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log(`\n  Copy website data: ${fromAccountId} → ${toAccountId}\n`);

  // 1. Fetch all pages from source account
  const { data: pages, error: pagesErr } = await supabase
    .from('instagram_bio_websites')
    .select('*')
    .eq('account_id', fromAccountId)
    .eq('processing_status', 'completed');

  if (pagesErr) {
    console.error('Failed to fetch pages:', pagesErr.message);
    process.exit(1);
  }

  console.log(`  Found ${pages.length} pages in source account`);

  // 2. Copy pages to target account
  const sessionId = `copy_${Date.now()}`;
  let saved = 0;
  for (const page of pages) {
    const { error } = await supabase.from('instagram_bio_websites').upsert(
      {
        account_id: toAccountId,
        url: page.url,
        page_title: page.page_title,
        page_description: page.page_description,
        page_content: page.page_content,
        image_urls: page.image_urls,
        meta_tags: page.meta_tags,
        structured_data: page.structured_data,
        extracted_data: page.extracted_data,
        parent_url: page.parent_url,
        crawl_depth: page.crawl_depth,
        http_status: page.http_status,
        content_type: page.content_type,
        processing_status: 'completed',
        source_type: 'standalone',
        scraped_at: new Date().toISOString(),
        crawl_session_id: sessionId,
      },
      { onConflict: 'account_id,url' },
    );

    if (error) {
      console.error(`  DB error for ${page.url}: ${error.message}`);
    } else {
      saved++;
    }
  }
  console.log(`  Saved ${saved}/${pages.length} pages to target account\n`);

  // 3. Clean old website RAG data from target account
  const { data: oldDocs } = await supabase
    .from('documents')
    .select('id')
    .eq('account_id', toAccountId)
    .eq('entity_type', 'website');

  if (oldDocs && oldDocs.length > 0) {
    for (const doc of oldDocs) {
      await supabase.from('document_chunks').delete().eq('document_id', doc.id);
    }
    await supabase
      .from('documents')
      .delete()
      .eq('account_id', toAccountId)
      .eq('entity_type', 'website');
    console.log(`  Cleaned ${oldDocs.length} old RAG documents\n`);
  }

  // 4. RAG ingestion for target account
  console.log(`  RAG ingestion (${pages.length} pages):`);
  let totalChunks = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page.page_content || page.page_content.length < 50) continue;

    const shortUrl = decodeURIComponent(page.url.replace(/https?:\/\/[^/]+/, '') || '/');
    process.stdout.write(`  [${i + 1}/${pages.length}] ${shortUrl}...`);

    // Create document
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        account_id: toAccountId,
        entity_type: 'website',
        source_id: page.url,
        title: page.page_title || page.url,
        status: 'active',
        metadata: {
          url: page.url,
          wordCount: page.page_content.split(/\s+/).filter(Boolean).length,
          pageType: page.meta_tags?.pageType || 'page',
          images: (page.image_urls || []).slice(0, 5),
        },
      })
      .select('id')
      .single();

    if (docErr) {
      console.log(` error: ${docErr.message}`);
      continue;
    }

    // Chunk content
    const chunks = chunkText(page.page_content, 600, 100);

    // Batch embeddings
    for (let j = 0; j < chunks.length; j += 20) {
      const batch = chunks.slice(j, j + 20);
      const embeddings = await getEmbeddingBatch(batch);
      if (!embeddings) continue;

      const rows = batch.map((text, k) => ({
        document_id: doc.id,
        account_id: toAccountId,
        entity_type: 'website',
        chunk_index: j + k,
        chunk_text: text,
        embedding: embeddings[k],
        token_count: Math.ceil(text.length / 4),
        metadata: { url: page.url, title: page.page_title },
      }));

      const { error } = await supabase.from('document_chunks').insert(rows);
      if (!error) totalChunks += rows.length;
    }

    await supabase
      .from('documents')
      .update({ chunk_count: chunks.length, total_tokens: Math.ceil(page.page_content.length / 4) })
      .eq('id', doc.id);

    console.log(` ${chunks.length} chunks`);
  }

  console.log(`\n  Done!`);
  console.log(`  Pages copied: ${saved}`);
  console.log(`  RAG chunks created: ${totalChunks}`);
}

function chunkText(text, maxChars = 600, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + maxChars * 0.5) end = breakPoint + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 30);
}

async function getEmbeddingBatch(texts) {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts.map((t) => t.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`   Embedding error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (e) {
    console.error(`   Embedding exception: ${e.message}`);
    return null;
  }
}

main().catch(console.error);
