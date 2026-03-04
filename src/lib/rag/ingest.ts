/**
 * RAG Ingestion Pipeline
 *
 * Takes content from any source table, normalizes it, chunks it,
 * generates embeddings, and writes documents + chunks to Supabase.
 *
 * Supports:
 * - Single document ingestion
 * - Bulk ingestion from existing DB tables
 * - Incremental re-ingestion (upsert by source_id)
 */

import { createClient } from '@/lib/supabase/server';
import { chunkText, normalizeText, estimateTokens } from './chunker';
import { generateEmbeddings } from './embeddings';
import { createLogger } from './logger';
import type {
  EntityType,
  IngestInput,
  IngestResult,
  ENTITY_TYPE_SOURCE_TABLE,
} from './types';

const log = createLogger('ingest');

// ============================================
// Single Document Ingestion
// ============================================

/**
 * Ingest a single document: normalize → chunk → embed → store.
 * If the same source_id + entity_type already exists for this account,
 * the old document and its chunks are replaced.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const startMs = Date.now();
  const supabase = createClient();
  const { accountId, entityType, sourceId, title, text, metadata = {} } = input;

  log.info('Ingesting document', { accountId, entityType, sourceId, title: title.substring(0, 80) }, accountId);

  // 1. Normalize text
  const normalized = normalizeText(text);
  if (!normalized) {
    log.warn('Empty text after normalization, skipping', { accountId, entityType, sourceId }, accountId);
    return { documentId: '', chunksCreated: 0, totalTokens: 0, durationMs: Date.now() - startMs };
  }

  // 2. Chunk
  const chunks = chunkText(normalized);
  const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

  log.info('Chunked document', {
    chunkCount: chunks.length,
    totalTokens,
    avgTokensPerChunk: Math.round(totalTokens / Math.max(chunks.length, 1)),
  }, accountId);

  // 3. Generate embeddings for all chunks
  const chunkTexts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddings(chunkTexts);

  // 4. Upsert document (delete old if exists with same source)
  if (sourceId) {
    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('account_id', accountId)
      .eq('entity_type', entityType)
      .eq('source_id', sourceId)
      .maybeSingle();

    if (existing) {
      // Delete old chunks (cascade from document delete handles this,
      // but explicit delete is clearer)
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', existing.id);

      await supabase
        .from('documents')
        .delete()
        .eq('id', existing.id);

      log.info('Replaced existing document', { oldDocId: existing.id }, accountId);
    }
  }

  // 5. Insert document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      entity_type: entityType,
      source_id: sourceId || null,
      title,
      source: entityType,
      status: 'active',
      chunk_count: chunks.length,
      total_tokens: totalTokens,
      metadata,
    })
    .select('id')
    .single();

  if (docError || !doc) {
    log.error('Failed to insert document', {
      error: docError?.message,
    }, accountId);
    throw new Error(`Failed to insert document: ${docError?.message}`);
  }

  // 6. Insert chunks with embeddings
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    account_id: accountId,
    entity_type: entityType,
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    embedding: JSON.stringify(embeddings[i]),
    token_count: chunk.tokenCount,
    metadata: {
      ...metadata,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
    },
  }));

  // Insert in batches of 50 (Supabase limit)
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
    const batch = chunkRows.slice(i, i + BATCH_SIZE);
    const { error: chunkError } = await supabase
      .from('document_chunks')
      .insert(batch);

    if (chunkError) {
      log.error('Failed to insert chunks', {
        batchIndex: i / BATCH_SIZE,
        error: chunkError.message,
      }, accountId);
      throw new Error(`Failed to insert chunks: ${chunkError.message}`);
    }
  }

  const durationMs = Date.now() - startMs;
  log.info('Ingestion complete', {
    documentId: doc.id,
    chunksCreated: chunks.length,
    totalTokens,
    durationMs,
  }, accountId);

  return {
    documentId: doc.id,
    chunksCreated: chunks.length,
    totalTokens,
    durationMs,
  };
}

// ============================================
// Bulk Ingestion from Existing Tables
// ============================================

/**
 * Ingest all content for an account from existing DB tables.
 * Processes: posts, transcriptions, partnerships, coupons,
 * knowledge base, and scraped websites.
 */
export async function ingestAllForAccount(
  accountId: string,
  options?: { entityTypes?: EntityType[]; batchSize?: number }
): Promise<{ total: number; byType: Record<string, number>; errors: string[] }> {
  const supabase = createClient();
  const types = options?.entityTypes || [
    'post', 'transcription', 'partnership', 'coupon', 'knowledge_base', 'website',
  ];

  const result = { total: 0, byType: {} as Record<string, number>, errors: [] as string[] };

  for (const entityType of types) {
    try {
      const count = await ingestEntityType(supabase, accountId, entityType);
      result.byType[entityType] = count;
      result.total += count;
    } catch (err) {
      const msg = `Failed to ingest ${entityType}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      log.error(msg, { accountId, entityType }, accountId);
    }
  }

  log.info('Bulk ingestion complete', {
    accountId,
    total: result.total,
    byType: result.byType,
    errorCount: result.errors.length,
  }, accountId);

  return result;
}

async function ingestEntityType(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  entityType: EntityType
): Promise<number> {
  let count = 0;

  switch (entityType) {
    case 'post': {
      const { data: posts } = await supabase
        .from('instagram_posts')
        .select('id, caption, type, hashtags, posted_at, likes_count, is_sponsored')
        .eq('account_id', accountId)
        .not('caption', 'is', null)
        .order('posted_at', { ascending: false });

      if (posts) {
        for (const post of posts) {
          if (!post.caption?.trim()) continue;
          try {
            const text = buildPostText(post);
            await ingestDocument({
              accountId,
              entityType: 'post',
              sourceId: post.id,
              title: truncate(post.caption, 120),
              text,
              metadata: {
                postType: post.type,
                hashtags: post.hashtags,
                postedAt: post.posted_at,
                likesCount: post.likes_count,
                isSponsored: post.is_sponsored,
              },
            });
            count++;
          } catch (err) {
            log.warn(`Skipping post ${post.id}: ${err instanceof Error ? err.message : String(err)}`, { accountId, postId: post.id }, accountId);
          }
        }
      }
      break;
    }

    case 'transcription': {
      // Fetch ALL completed transcriptions — including those with only on_screen_text
      const { data: trans } = await supabase
        .from('instagram_transcriptions')
        .select('id, transcription_text, source_type, source_id, language, on_screen_text, created_at')
        .eq('account_id', accountId)
        .eq('processing_status', 'completed');

      if (trans) {
        for (const t of trans) {
          const hasSpokenText = !!t.transcription_text?.trim();
          const hasScreenText = Array.isArray(t.on_screen_text) && t.on_screen_text.length > 0;

          // Skip only if BOTH are empty
          if (!hasSpokenText && !hasScreenText) continue;

          try {
            // Build text: put on_screen_text FIRST for better embedding quality.
            // On-screen text is usually structured (recipes, instructions, key info)
            // while spoken text can be noisy filler.
            let text = '';
            if (hasScreenText) {
              const screenContent = t.on_screen_text.join(' | ');
              text = screenContent;
            }
            if (hasSpokenText) {
              text = text
                ? text + '\n\n' + t.transcription_text!
                : t.transcription_text!;
            }

            // Title: prefer on_screen_text since it's more descriptive
            const title = hasScreenText
              ? truncate(t.on_screen_text[0], 120)
              : truncate(t.transcription_text, 120);

            await ingestDocument({
              accountId,
              entityType: 'transcription',
              sourceId: t.id,
              title,
              text,
              metadata: {
                sourceType: t.source_type,
                originalSourceId: t.source_id,
                language: t.language,
              },
            });
            count++;
          } catch (err) {
            log.warn(`Skipping transcription ${t.id}: ${err instanceof Error ? err.message : String(err)}`, { accountId, transcriptionId: t.id }, accountId);
          }
        }
      }
      break;
    }

    case 'partnership': {
      const { data: partnerships } = await supabase
        .from('partnerships')
        .select('id, brand_name, brief, contract_scope, notes, category, status, start_date, end_date, deliverables, coupon_code, link')
        .eq('account_id', accountId)
        .eq('is_active', true);

      if (partnerships) {
        for (const p of partnerships) {
          const text = buildPartnershipText(p);
          if (!text.trim()) continue;
          await ingestDocument({
            accountId,
            entityType: 'partnership',
            sourceId: p.id,
            title: `Partnership: ${p.brand_name}`,
            text,
            metadata: {
              brandName: p.brand_name,
              category: p.category,
              status: p.status,
              startDate: p.start_date,
              endDate: p.end_date,
            },
          });
          count++;
        }
      }
      break;
    }

    case 'coupon': {
      const { data: coupons } = await supabase
        .from('coupons')
        .select('id, code, description, brand_name, brand_category, discount_type, discount_value, currency, start_date, end_date, brand_link')
        .eq('account_id', accountId)
        .eq('is_active', true);

      if (coupons) {
        for (const c of coupons) {
          const text = buildCouponText(c);
          await ingestDocument({
            accountId,
            entityType: 'coupon',
            sourceId: c.id,
            title: `Coupon: ${c.code} (${c.brand_name || 'Unknown brand'})`,
            text,
            metadata: {
              code: c.code,
              brandName: c.brand_name,
              discountType: c.discount_type,
              discountValue: c.discount_value,
            },
          });
          count++;
        }
      }
      break;
    }

    case 'knowledge_base': {
      const { data: kbs } = await supabase
        .from('chatbot_knowledge_base')
        .select('id, title, content, knowledge_type, keywords')
        .eq('account_id', accountId)
        .eq('is_active', true);

      if (kbs) {
        for (const kb of kbs) {
          if (!kb.content?.trim()) continue;
          await ingestDocument({
            accountId,
            entityType: 'knowledge_base',
            sourceId: kb.id,
            title: kb.title,
            text: kb.content,
            metadata: {
              knowledgeType: kb.knowledge_type,
              keywords: kb.keywords,
            },
          });
          count++;
        }
      }
      break;
    }

    case 'website': {
      const { data: websites } = await supabase
        .from('instagram_bio_websites')
        .select('id, url, page_title, page_content, page_description')
        .eq('account_id', accountId)
        .eq('processing_status', 'completed')
        .not('page_content', 'is', null);

      if (websites) {
        for (const w of websites) {
          if (!w.page_content?.trim()) continue;
          let text = '';
          if (w.page_title) text += `Title: ${w.page_title}\n`;
          if (w.page_description) text += `Description: ${w.page_description}\n\n`;
          text += w.page_content;

          await ingestDocument({
            accountId,
            entityType: 'website',
            sourceId: w.id,
            title: w.page_title || w.url,
            text,
            metadata: { url: w.url },
          });
          count++;
        }
      }
      break;
    }
  }

  log.info(`Ingested ${count} ${entityType} documents`, { accountId, entityType, count }, accountId);
  return count;
}

// ============================================
// Text Builders
// ============================================

export function buildPostText(post: {
  caption: string | null;
  type?: string;
  hashtags?: string[];
  likes_count?: number;
  is_sponsored?: boolean;
}): string {
  let text = post.caption || '';
  if (post.type) text = `[${post.type}] ${text}`;
  if (post.hashtags?.length) text += '\nHashtags: ' + post.hashtags.join(', ');
  if (post.is_sponsored) text += '\n[Sponsored content]';
  return text;
}

function buildPartnershipText(p: {
  brand_name: string;
  brief?: string | null;
  contract_scope?: string | null;
  notes?: string | null;
  category?: string | null;
  status?: string;
  deliverables?: unknown;
  coupon_code?: string | null;
  link?: string | null;
}): string {
  const parts = [`Brand: ${p.brand_name}`];
  if (p.category) parts.push(`Category: ${p.category}`);
  if (p.status) parts.push(`Status: ${p.status}`);
  if (p.brief) parts.push(`Brief: ${p.brief}`);
  if (p.contract_scope) parts.push(`Scope: ${p.contract_scope}`);
  if (p.coupon_code) parts.push(`Coupon code: ${p.coupon_code}`);
  if (p.link) parts.push(`Link: ${p.link}`);
  if (p.notes) parts.push(`Notes: ${p.notes}`);
  if (p.deliverables && Array.isArray(p.deliverables) && p.deliverables.length > 0) {
    parts.push('Deliverables: ' + JSON.stringify(p.deliverables));
  }
  return parts.join('\n');
}

function buildCouponText(c: {
  code: string;
  description?: string | null;
  brand_name?: string | null;
  brand_category?: string | null;
  discount_type: string;
  discount_value: number;
  currency?: string | null;
  brand_link?: string | null;
}): string {
  const parts = [`Coupon code: ${c.code}`];
  if (c.brand_name) parts.push(`Brand: ${c.brand_name}`);
  if (c.brand_category) parts.push(`Category: ${c.brand_category}`);
  parts.push(`Discount: ${c.discount_value}${c.discount_type === 'percentage' ? '%' : ` ${c.currency || 'ILS'}`} (${c.discount_type})`);
  if (c.description) parts.push(`Description: ${c.description}`);
  if (c.brand_link) parts.push(`Link: ${c.brand_link}`);
  return parts.join('\n');
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}
