#!/usr/bin/env node
/**
 * Scrape highlights for a specific account → save items → build RAG chunks with embeddings
 * Usage: node scripts/scrape-highlights.mjs <username> <accountId>
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCRAPECREATORS_KEY = process.env.SCRAPECREATORS_API_KEY;
const SCRAPECREATORS_BASE = process.env.SCRAPECREATORS_BASE_URL || 'https://api.scrapecreators.com';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE env vars'); process.exit(1); }
if (!SCRAPECREATORS_KEY) { console.error('Missing SCRAPECREATORS_API_KEY'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

const username = process.argv[2];
const accountId = process.argv[3];
if (!username || !accountId) { console.error('Usage: node scripts/scrape-highlights.mjs <username> <accountId>'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });
const api = axios.create({
  baseURL: SCRAPECREATORS_BASE,
  headers: { 'x-api-key': SCRAPECREATORS_KEY },
  timeout: 60000,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================
// ScrapeCreators API
// ============================================

async function getHighlights(username) {
  const { data } = await api.get('/v1/instagram/user/highlights', { params: { handle: username } });
  const highlights = data?.highlights || data || [];
  return highlights.map(h => ({
    highlight_id: h.id,
    title: h.title || '',
    cover_url: h.cover_media?.cropped_image_version?.url || '',
    items_count: h.media_count || 0,
  }));
}

async function getHighlightDetail(highlightId) {
  const { data } = await api.get('/v1/instagram/user/highlight/detail', { params: { id: highlightId } });
  return {
    highlight_id: data.id || highlightId,
    title: data.title || '',
    items: (data.items || []).map(item => {
      const videoUrl = item.video_versions?.[0]?.url || item.video_url;
      const imageUrl = item.image_versions2?.candidates?.[0]?.url || item.image_url;
      return {
        story_id: String(item.pk || item.id),
        media_type: item.media_type === 1 ? 'image' : (item.media_type === 2 ? 'video' : 'image'),
        media_url: videoUrl || imageUrl || '',
        thumbnail_url: item.image_versions2?.candidates?.[0]?.url || '',
      };
    }),
  };
}

// ============================================
// Embedding
// ============================================

async function getEmbedding(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log(`\n🔍 Scraping highlights for @${username} (${accountId})\n`);

  // Step 1: Get highlights
  console.log('📋 Step 1: Fetching highlight list...');
  const highlights = await getHighlights(username);
  console.log(`   Found ${highlights.length} highlights\n`);
  if (highlights.length === 0) { console.log('Done.'); return; }

  // Step 2: Fetch items per highlight and save to DB
  console.log('📦 Step 2: Scraping items per highlight...');
  let totalItems = 0;

  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    process.stdout.write(`   [${i + 1}/${highlights.length}] "${h.title}"...`);

    try {
      const detail = await getHighlightDetail(h.highlight_id);

      const { data: saved, error: hErr } = await supabase
        .from('instagram_highlights')
        .upsert({
          account_id: accountId,
          highlight_id: h.highlight_id,
          title: h.title || detail.title,
          cover_image_url: h.cover_url,
          items_count: detail.items.length,
          scraped_at: new Date().toISOString(),
        }, { onConflict: 'account_id,highlight_id' })
        .select('id')
        .single();

      if (hErr) { console.log(` ✗ ${hErr.message}`); continue; }

      if (detail.items.length > 0 && saved) {
        const rows = detail.items.map((item, idx) => ({
          highlight_id: saved.id,
          account_id: accountId,
          item_id: item.story_id,
          item_index: idx,
          media_type: item.media_type,
          media_url: item.media_url,
          thumbnail_url: item.thumbnail_url,
          scraped_at: new Date().toISOString(),
        }));

        const { error: iErr } = await supabase
          .from('instagram_highlight_items')
          .upsert(rows, { onConflict: 'highlight_id,item_id' });

        if (iErr) console.log(` ✗ items: ${iErr.message}`);
        else { totalItems += detail.items.length; console.log(` ✓ ${detail.items.length} items`); }
      } else {
        console.log(` ✓ 0 items`);
      }

      await sleep(1000);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  console.log(`\n✅ Step 2 done: ${highlights.length} highlights, ${totalItems} items\n`);

  // Step 3: Build RAG documents + chunks with embeddings
  console.log('🧠 Step 3: Building RAG documents with embeddings...');

  const { data: allHL } = await supabase
    .from('instagram_highlights')
    .select('id, highlight_id, title, items_count')
    .eq('account_id', accountId);

  let docsCreated = 0;

  for (const hl of (allHL || [])) {
    // Get item IDs for this highlight
    const { data: items } = await supabase
      .from('instagram_highlight_items')
      .select('id, media_type')
      .eq('highlight_id', hl.id);

    const itemIds = (items || []).map(i => i.id);
    const videoCount = (items || []).filter(i => i.media_type === 'video').length;
    const imageCount = (items || []).filter(i => i.media_type === 'image').length;

    // Check for existing transcriptions of these items
    let transcriptionTexts = [];
    if (itemIds.length > 0) {
      const { data: trans } = await supabase
        .from('transcriptions')
        .select('text')
        .eq('source_type', 'highlight_item')
        .in('source_id', itemIds);
      transcriptionTexts = (trans || []).map(t => t.text).filter(Boolean);
    }

    // Build content text
    let contentText = `הילייט אינסטגרם: "${hl.title}" — ${itemIds.length} פריטים (${videoCount} סרטונים, ${imageCount} תמונות).`;
    if (transcriptionTexts.length > 0) {
      contentText += `\nתמלולים:\n${transcriptionTexts.join('\n---\n')}`;
    }

    if (contentText.length < 30) continue;

    try {
      // Check if document already exists
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('account_id', accountId)
        .eq('entity_type', 'highlight')
        .eq('source_id', hl.highlight_id)
        .maybeSingle();

      if (existing) {
        // Delete old chunks
        await supabase.from('document_chunks').delete().eq('document_id', existing.id);
        await supabase.from('documents').delete().eq('id', existing.id);
      }

      // Insert new document
      const tokenCount = Math.ceil(contentText.length / 4);
      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({
          account_id: accountId,
          entity_type: 'highlight',
          source_id: hl.highlight_id,
          title: `הילייט: ${hl.title}`,
          source: 'highlight',
          status: 'active',
          chunk_count: 1,
          total_tokens: tokenCount,
          metadata: { title: hl.title, items_count: hl.items_count, videoCount, imageCount },
        })
        .select('id')
        .single();

      if (docErr || !doc) { console.log(`   ✗ "${hl.title}": ${docErr?.message}`); continue; }

      // Generate embedding
      const embedding = await getEmbedding(contentText);

      // Insert chunk
      const { error: chunkErr } = await supabase
        .from('document_chunks')
        .insert({
          document_id: doc.id,
          account_id: accountId,
          entity_type: 'highlight',
          chunk_index: 0,
          chunk_text: contentText,
          embedding: JSON.stringify(embedding),
          token_count: tokenCount,
          metadata: { title: hl.title, items_count: hl.items_count },
        });

      if (chunkErr) {
        console.log(`   ✗ "${hl.title}" chunk: ${chunkErr.message}`);
      } else {
        docsCreated++;
        console.log(`   ✓ "${hl.title}" — ${contentText.length} chars, ${tokenCount} tokens`);
      }

      await sleep(200); // Rate limit OpenAI
    } catch (err) {
      console.log(`   ✗ "${hl.title}": ${err.message}`);
    }
  }

  console.log(`\n✅ Step 3 done: ${docsCreated} RAG documents with embeddings created`);
  console.log(`\n🎉 All done! @${username} highlights fully scraped & indexed.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
