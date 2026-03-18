/**
 * RAG Chunk Enrichment Pipeline
 *
 * Enriches document_chunks with:
 * 1. Hebrew summaries for English content (bilingual embedding)
 * 2. Synthetic queries — questions each chunk answers (better retrieval)
 * 3. Partnership enrichment — links brand names to related content
 * 4. Cleanup of tiny/noisy chunks (< 20 tokens)
 *
 * Can run as:
 * - Post-ingestion step (called after ingestAllForAccount)
 * - Standalone enrichment for existing accounts
 */

import { createClient } from '@/lib/supabase/server';
import { generateEmbeddings } from './embeddings';
import { createLogger } from './logger';

const log = createLogger('enrich');

// ============================================
// Types
// ============================================

interface EnrichmentResult {
  accountId: string;
  chunksEnriched: number;
  chunksDeleted: number;
  syntheticQueriesAdded: number;
  translationsAdded: number;
  partnershipsEnriched: number;
  durationMs: number;
  errors: string[];
}

interface ChunkRow {
  id: string;
  document_id: string;
  entity_type: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  metadata: Record<string, unknown> | null;
}

// ============================================
// Main Enrichment Function
// ============================================

/**
 * Enrich all chunks for an account.
 * Safe to run multiple times — skips already-enriched chunks.
 */
export async function enrichAccountChunks(
  accountId: string,
  options?: {
    dryRun?: boolean;
    skipTranslation?: boolean;
    skipSyntheticQueries?: boolean;
    skipCleanup?: boolean;
    skipPartnershipEnrich?: boolean;
    geminiApiKey?: string;
    openaiApiKey?: string;
  }
): Promise<EnrichmentResult> {
  const startMs = Date.now();
  const supabase = createClient();
  const result: EnrichmentResult = {
    accountId,
    chunksEnriched: 0,
    chunksDeleted: 0,
    syntheticQueriesAdded: 0,
    translationsAdded: 0,
    partnershipsEnriched: 0,
    durationMs: 0,
    errors: [],
  };

  log.info('Starting enrichment', { accountId }, accountId);

  // --- Step 1: Cleanup tiny/noisy chunks ---
  if (!options?.skipCleanup) {
    try {
      const deleted = await cleanupTinyChunks(supabase, accountId, options?.dryRun);
      result.chunksDeleted = deleted;
      log.info(`Cleanup: ${deleted} tiny chunks ${options?.dryRun ? 'would be' : ''} deleted`, {}, accountId);
    } catch (err: any) {
      result.errors.push(`Cleanup failed: ${err.message}`);
      log.error('Cleanup failed', { error: err.message }, accountId);
    }
  }

  // --- Step 2: Generate Hebrew summaries for English-heavy chunks ---
  if (!options?.skipTranslation) {
    try {
      const translated = await addHebrewSummaries(supabase, accountId, options?.dryRun);
      result.translationsAdded = translated;
      log.info(`Translation: ${translated} chunks enriched with Hebrew summaries`, {}, accountId);
    } catch (err: any) {
      result.errors.push(`Translation failed: ${err.message}`);
      log.error('Translation failed', { error: err.message }, accountId);
    }
  }

  // --- Step 3: Generate synthetic queries ---
  if (!options?.skipSyntheticQueries) {
    try {
      const added = await addSyntheticQueries(supabase, accountId, options?.dryRun);
      result.syntheticQueriesAdded = added;
      log.info(`Synthetic queries: ${added} chunks enriched`, {}, accountId);
    } catch (err: any) {
      result.errors.push(`Synthetic queries failed: ${err.message}`);
      log.error('Synthetic queries failed', { error: err.message }, accountId);
    }
  }

  // --- Step 4: Enrich partnership chunks ---
  if (!options?.skipPartnershipEnrich) {
    try {
      const enriched = await enrichPartnershipChunks(supabase, accountId, options?.dryRun);
      result.partnershipsEnriched = enriched;
      log.info(`Partnership enrichment: ${enriched} chunks enriched`, {}, accountId);
    } catch (err: any) {
      result.errors.push(`Partnership enrichment failed: ${err.message}`);
      log.error('Partnership enrichment failed', { error: err.message }, accountId);
    }
  }

  result.chunksEnriched = result.translationsAdded + result.syntheticQueriesAdded + result.partnershipsEnriched;
  result.durationMs = Date.now() - startMs;

  log.info('Enrichment complete', result as unknown as Record<string, unknown>, accountId);
  return result;
}

// ============================================
// Step 1: Cleanup Tiny Chunks
// ============================================

async function cleanupTinyChunks(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  dryRun?: boolean
): Promise<number> {
  // Find chunks < 20 tokens that are mostly noise
  const { data: tiny } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, token_count, entity_type')
    .eq('account_id', accountId)
    .lt('token_count', 20);

  if (!tiny || tiny.length === 0) return 0;

  // Filter: keep short chunks that are actually meaningful (coupon codes, brand names with context)
  const toDelete = tiny.filter(c => {
    // Keep coupons — they're always useful even if short
    if (c.entity_type === 'coupon') return false;
    // Keep partnership — enriched later
    if (c.entity_type === 'partnership') return false;
    // Keep knowledge_base — manually curated
    if (c.entity_type === 'knowledge_base') return false;
    // Delete if it's just a title or noise
    return true;
  });

  if (toDelete.length === 0) return 0;

  if (!dryRun) {
    const ids = toDelete.map(c => c.id);
    // Delete in batches of 100
    for (let i = 0; i < ids.length; i += 100) {
      await supabase
        .from('document_chunks')
        .delete()
        .in('id', ids.slice(i, i + 100));
    }
  }

  return toDelete.length;
}

// ============================================
// Step 2: Hebrew Summaries for English Content
// ============================================

/**
 * Detect primarily-English chunks and add a Hebrew summary.
 * The summary is prepended to the chunk_text and re-embedded.
 */
async function addHebrewSummaries(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  dryRun?: boolean
): Promise<number> {
  // Find chunks that are mostly English and haven't been enriched yet
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, token_count, entity_type, metadata')
    .eq('account_id', accountId)
    .gt('token_count', 25) // Only meaningful chunks
    .limit(500);

  if (!chunks || chunks.length === 0) return 0;

  // Filter to English-heavy chunks not yet enriched
  const englishChunks = chunks.filter(c => {
    if ((c.metadata as any)?.enriched_he) return false; // Already enriched
    return isEnglishHeavy(c.chunk_text);
  });

  if (englishChunks.length === 0) return 0;

  log.info(`Found ${englishChunks.length} English-heavy chunks to translate`, {}, accountId);

  // Process in batches of 10 (Gemini rate limits)
  const BATCH = 10;
  let enriched = 0;

  for (let i = 0; i < englishChunks.length; i += BATCH) {
    const batch = englishChunks.slice(i, i + BATCH);

    try {
      const summaries = await generateHebrewSummaries(batch.map(c => c.chunk_text));

      if (dryRun) {
        enriched += summaries.filter(s => s).length;
        continue;
      }

      // Update each chunk: prepend Hebrew summary + re-embed
      const textsToEmbed: string[] = [];
      const chunksToUpdate: { id: string; newText: string; metadata: any }[] = [];

      for (let j = 0; j < batch.length; j++) {
        const summary = summaries[j];
        if (!summary) continue;

        const newText = `[סיכום: ${summary}]\n\n${batch[j].chunk_text}`;
        textsToEmbed.push(newText);
        chunksToUpdate.push({
          id: batch[j].id,
          newText,
          metadata: { ...(batch[j].metadata as any || {}), enriched_he: true, he_summary: summary },
        });
      }

      if (textsToEmbed.length > 0) {
        const embeddings = await generateEmbeddings(textsToEmbed);

        for (let j = 0; j < chunksToUpdate.length; j++) {
          await supabase
            .from('document_chunks')
            .update({
              chunk_text: chunksToUpdate[j].newText,
              embedding: JSON.stringify(embeddings[j]),
              metadata: chunksToUpdate[j].metadata,
            })
            .eq('id', chunksToUpdate[j].id);
        }

        enriched += chunksToUpdate.length;
      }
    } catch (err: any) {
      log.warn(`Batch ${i / BATCH} translation failed: ${err.message}`, {}, accountId);
    }
  }

  return enriched;
}

// ============================================
// Step 3: Synthetic Queries
// ============================================

/**
 * Generate 2-3 Hebrew questions each chunk answers.
 * Stored in metadata.synthetic_queries and embedded as separate chunks.
 */
async function addSyntheticQueries(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  dryRun?: boolean
): Promise<number> {
  // Get chunks without synthetic queries yet
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('id, document_id, chunk_text, token_count, entity_type, metadata')
    .eq('account_id', accountId)
    .gt('token_count', 30) // Only substantial chunks
    .limit(300);

  if (!chunks || chunks.length === 0) return 0;

  const unenriched = chunks.filter(c => !(c.metadata as any)?.synthetic_queries);
  if (unenriched.length === 0) return 0;

  log.info(`Generating synthetic queries for ${unenriched.length} chunks`, {}, accountId);

  const BATCH = 15;
  let total = 0;

  for (let i = 0; i < unenriched.length; i += BATCH) {
    const batch = unenriched.slice(i, i + BATCH);

    try {
      const querySets = await generateSyntheticQueries(batch.map(c => ({
        text: c.chunk_text,
        entityType: c.entity_type,
      })));

      if (dryRun) {
        total += querySets.filter(qs => qs.length > 0).length;
        continue;
      }

      for (let j = 0; j < batch.length; j++) {
        const queries = querySets[j];
        if (!queries || queries.length === 0) continue;

        // Update metadata with synthetic queries
        const newMetadata = {
          ...(batch[j].metadata as any || {}),
          synthetic_queries: queries,
        };

        // Enrich the chunk text with queries for better embedding
        const enrichedText = `${batch[j].chunk_text}\n\n[שאלות קשורות: ${queries.join(' | ')}]`;

        // Re-embed with enriched text
        const [embedding] = await generateEmbeddings([enrichedText]);

        await supabase
          .from('document_chunks')
          .update({
            chunk_text: enrichedText,
            embedding: JSON.stringify(embedding),
            metadata: newMetadata,
          })
          .eq('id', batch[j].id);

        total++;
      }
    } catch (err: any) {
      log.warn(`Batch ${i / BATCH} synthetic queries failed: ${err.message}`, {}, accountId);
    }
  }

  return total;
}

// ============================================
// Step 4: Partnership Enrichment
// ============================================

/**
 * Enrich partnership chunks by linking brand names to related post content.
 */
async function enrichPartnershipChunks(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  dryRun?: boolean
): Promise<number> {
  // Get partnership chunks
  const { data: partnershipChunks } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, metadata, token_count')
    .eq('account_id', accountId)
    .eq('entity_type', 'partnership');

  if (!partnershipChunks || partnershipChunks.length === 0) return 0;

  // Get all post chunks to find related content
  const { data: postChunks } = await supabase
    .from('document_chunks')
    .select('chunk_text, entity_type')
    .eq('account_id', accountId)
    .in('entity_type', ['post', 'transcription'])
    .gt('token_count', 30)
    .limit(500);

  if (!postChunks) return 0;

  let enriched = 0;

  for (const pc of partnershipChunks) {
    if ((pc.metadata as any)?.enriched_partnership) continue;

    // Extract brand name from chunk
    const brandMatch = pc.chunk_text.match(/Brand:\s*(.+?)(?:\n|$)/);
    if (!brandMatch) continue;
    const brandName = brandMatch[1].trim();

    // Find related content mentioning this brand
    const brandLower = brandName.toLowerCase();
    const relatedPosts = postChunks
      .filter(p => p.chunk_text.toLowerCase().includes(brandLower))
      .slice(0, 3);

    if (relatedPosts.length === 0) continue;

    // Build enriched text
    const relatedSummary = relatedPosts
      .map(p => p.chunk_text.substring(0, 200))
      .join('\n---\n');

    const enrichedText = `${pc.chunk_text}\n\nתוכן קשור למותג ${brandName}:\n${relatedSummary}`;

    if (dryRun) {
      enriched++;
      continue;
    }

    // Re-embed
    const [embedding] = await generateEmbeddings([enrichedText]);

    await supabase
      .from('document_chunks')
      .update({
        chunk_text: enrichedText,
        embedding: JSON.stringify(embedding),
        metadata: { ...(pc.metadata as any || {}), enriched_partnership: true },
      })
      .eq('id', pc.id);

    enriched++;
  }

  return enriched;
}

// ============================================
// AI Helpers (Gemini Flash for cost efficiency)
// ============================================

/**
 * Generate Hebrew summaries for English texts using Gemini Flash.
 */
async function generateHebrewSummaries(texts: string[]): Promise<(string | null)[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const prompt = `You are a translation assistant. For each text below, write a concise Hebrew summary (1-2 sentences).
The summary should capture the KEY TOPIC and MAIN POINT of the text.
If the text is about a campaign — mention the brand, type of campaign, and what was done.
If it's about tips/advice — summarize the main tip.

Return ONLY a JSON array of strings. One summary per input text. If a text is already in Hebrew, return null for that entry.

Texts:
${texts.map((t, i) => `[${i}] ${t.substring(0, 500)}`).join('\n\n')}`;

  const response = await genai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 2000,
    },
  });

  const raw = response.text || '';
  try {
    // Extract JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    log.warn('Failed to parse translation response', { raw: raw.substring(0, 200) });
  }

  return texts.map(() => null);
}

/**
 * Generate synthetic Hebrew queries for chunks.
 */
async function generateSyntheticQueries(
  chunks: Array<{ text: string; entityType: string }>
): Promise<string[][]> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const prompt = `You are a Hebrew Q&A assistant. For each content chunk below, generate 2-3 SHORT questions (in Hebrew) that this chunk can answer.
Questions should be natural — the kind a user would ask a chatbot about this content.

Examples:
- For a campaign chunk: "מה עשיתם עם נספרסו?", "ספרו על קמפיין קפה"
- For a tip/advice chunk: "איך לגדול באינסטגרם?", "טיפים לתוכן"
- For a brand chunk: "יש לכם שיתוף פעולה עם X?"

Return a JSON array of arrays. Each inner array has 2-3 Hebrew questions.

Chunks:
${chunks.map((c, i) => `[${i}] (${c.entityType}) ${c.text.substring(0, 400)}`).join('\n\n')}`;

  const response = await genai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      temperature: 0.4,
      maxOutputTokens: 3000,
    },
  });

  const raw = response.text || '';
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    log.warn('Failed to parse synthetic queries response', { raw: raw.substring(0, 200) });
  }

  return chunks.map(() => []);
}

// ============================================
// Helpers
// ============================================

/**
 * Check if text is primarily English (> 60% ASCII letters).
 */
function isEnglishHeavy(text: string): boolean {
  const asciiLetters = text.match(/[a-zA-Z]/g)?.length || 0;
  const hebrewLetters = text.match(/[\u0590-\u05FF]/g)?.length || 0;
  const total = asciiLetters + hebrewLetters;
  if (total < 10) return false; // Too short to classify
  return asciiLetters / total > 0.6;
}

export { isEnglishHeavy, cleanupTinyChunks };
