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
  entitiesExtracted: number;
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
    skipTopicClassification?: boolean;
    skipEntityExtraction?: boolean;
    forceSyntheticQueries?: boolean;
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
    entitiesExtracted: 0,
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
      const added = await addSyntheticQueries(supabase, accountId, options?.dryRun, options?.forceSyntheticQueries);
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

  // --- Step 5: Topic classification ---
  if (!options?.skipTopicClassification) {
    try {
      const topicsClassified = await classifyChunkTopics(supabase, accountId, options?.dryRun);
      log.info(`Topic classification: ${topicsClassified} chunks classified`, {}, accountId);
      result.chunksEnriched += topicsClassified;
    } catch (err: any) {
      result.errors.push(`Topic classification failed: ${err.message}`);
      log.error('Topic classification failed', { error: err.message }, accountId);
    }
  }

  // --- Step 6: Entity extraction (media_news accounts only) ---
  if (!options?.skipEntityExtraction) {
    try {
      // Check if account is media_news archetype
      const { data: account } = await supabase
        .from('accounts')
        .select('config')
        .eq('id', accountId)
        .single();

      const archetype = (account?.config as any)?.archetype;

      if (archetype === 'media_news') {
        const { extractEntitiesForAccount } = await import('@/lib/hot-topics/extract-entities');

        // Load chunks that haven't been entity-extracted yet
        const { data: chunks } = await supabase
          .from('document_chunks')
          .select('id, chunk_text, entity_type, metadata')
          .eq('account_id', accountId)
          .in('entity_type', ['post', 'transcription', 'highlight'])
          .gt('token_count', 25);

        if (chunks && chunks.length > 0) {
          const { extracted, errors: extractErrors } = await extractEntitiesForAccount(
            accountId,
            chunks,
            { dryRun: options?.dryRun, geminiApiKey: options?.geminiApiKey }
          );
          result.entitiesExtracted = extracted;
          if (extractErrors.length > 0) {
            result.errors.push(...extractErrors.slice(0, 3));
          }
          log.info(`Entity extraction: ${extracted} entities from ${chunks.length} chunks`, {}, accountId);
        }
      } else {
        log.info('Entity extraction: skipped (not media_news archetype)', {}, accountId);
      }
    } catch (err: any) {
      result.errors.push(`Entity extraction failed: ${err.message}`);
      log.error('Entity extraction failed', { error: err.message }, accountId);
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
  // Paginate through ALL chunks — no single-query limit
  let allEnglishChunks: ChunkRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, document_id, chunk_text, token_count, entity_type, chunk_index, metadata')
      .eq('account_id', accountId)
      .gt('token_count', 25)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (!chunks || chunks.length === 0) break;

    const english = chunks.filter(c => {
      if ((c.metadata as any)?.enriched_he) return false;
      return isEnglishHeavy(c.chunk_text);
    });
    allEnglishChunks = allEnglishChunks.concat(english as ChunkRow[]);

    if (chunks.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allEnglishChunks.length === 0) return 0;

  log.info(`Found ${allEnglishChunks.length} English-heavy chunks to translate`, {}, accountId);
  const englishChunks = allEnglishChunks;

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
  dryRun?: boolean,
  force?: boolean
): Promise<number> {
  // Paginate through ALL chunks — no single-query limit
  let unenriched: ChunkRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, document_id, chunk_text, token_count, entity_type, chunk_index, metadata')
      .eq('account_id', accountId)
      .gt('token_count', 30)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (!chunks || chunks.length === 0) break;

    const batch = force
      ? (chunks as ChunkRow[])
      : chunks.filter(c => !(c.metadata as any)?.synthetic_queries) as ChunkRow[];
    unenriched = unenriched.concat(batch);

    if (chunks.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (unenriched.length === 0) return 0;

  log.info(`Generating synthetic queries for ${unenriched.length} chunks`, {}, accountId);

  const BATCH = 15;
  let total = 0;

  for (let i = 0; i < unenriched.length; i += BATCH) {
    const batch = unenriched.slice(i, i + BATCH);

    // Strip any pre-existing `[שאלות קשורות: ...]` suffix so re-runs don't double up
    const stripQuerySuffix = (t: string) => t.replace(/\n*\[שאלות קשורות:[\s\S]*$/u, '').trimEnd();

    try {
      const querySets = await generateSyntheticQueries(batch.map(c => ({
        text: stripQuerySuffix(c.chunk_text),
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

        // Enrich the chunk text with queries for better embedding (on the stripped base)
        const baseText = stripQuerySuffix(batch[j].chunk_text);
        const enrichedText = `${baseText}\n\n[שאלות קשורות: ${queries.join(' | ')}]`;

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

  const prompt = `You are a Hebrew translation assistant. Your task: summarize each English text below INTO HEBREW (עברית).

CRITICAL: Every summary MUST be written in Hebrew characters (עברית). Do NOT write summaries in English.

Rules:
- Write 1-2 sentence summary IN HEBREW for each text
- Capture the KEY TOPIC and MAIN POINT
- If about a campaign — mention the brand, type, and what was done (in Hebrew)
- If about tips/advice — summarize the main tip (in Hebrew)
- If the text is already in Hebrew — return null for that entry

Return ONLY a JSON array of strings (Hebrew) or nulls. One entry per input text.

Example output: ["סוכנות לידרס יוצרת תוכן משפיע בשילוב אסטרטגיה והבנת שוק", null, "המאמר דן בעליית המשפיענים באינסטגרם"]

Texts:
${texts.map((t, i) => `[${i}] ${t.substring(0, 500)}`).join('\n\n')}`;

  const response = await genai.models.generateContent({
    model: 'gemini-3.5-flash',
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

  const prompt = `You generate questions that a real fan/follower would ask.
Based ONLY on the text below, write 2-3 short Hebrew questions per chunk.
Do NOT invent information not in the text.
Do NOT add related topics — only what's explicitly mentioned.

CRITICAL — every question MUST be UNIQUELY answerable by THIS chunk alone.
The chunk is one of thousands from the same creator. Generic questions
that could match many chunks are USELESS for retrieval evaluation.

Each question must contain at least ONE specific anchor from the chunk:
a brand name, product name, a distinctive phrase, a specific number/date,
or a unique keyword. If you cannot identify such an anchor, produce fewer
(or zero) questions rather than a generic one.

BAD (generic — will match many chunks, REJECTED):
  ❌ "מה שם המותג?"
  ❌ "כמה אחוז הנחה יש?"
  ❌ "מה הקוד קופון?"
  ❌ "איזה מוצר זה?"
  ❌ "מה המחיר?"

GOOD (specific — uniquely identifies this chunk):
  ✓ "מה שם המותג שמשתף פעולה עם מירן על מסכת ה-PDRN?"
  ✓ "כמה אחוז הנחה נותן קוד MIRAN10 אצל Opticana?"
  ✓ "מה הקוד להנחה ב-Leaves למסכת הפנים?"
  ✓ "על איזה סרום ויטמין C מדברים ברילס עם ארגניה?"
  ✓ "עד מתי תקפה ההנחה של 25% ההשקה?"

Other rules:
- If the text is about a recipe for pasta → questions about pasta, NOT about other dishes
- If the text is about a hair product → questions about that product, NOT about food
- Questions must be answerable from the chunk text alone
- Prefer 2 specific questions over 3 vague ones. Zero > generic.

Return a JSON array of arrays. Each inner array has 0-3 Hebrew questions.

Chunks:
${chunks.map((c, i) => `[${i}] (${c.entityType}) ${c.text.substring(0, 400)}`).join('\n\n')}`;

  const response = await genai.models.generateContent({
    model: 'gemini-3.5-flash',
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
// Step 5: Topic Classification
// ============================================

/** Valid topics for chunk classification */
/**
 * The retail taxonomy. Every account that existed before archetype-scoped topics
 * was classified with exactly this list, and it stays the default, so no existing
 * account's chunks change meaning.
 */
export const RETAIL_TOPICS = [
  'food',      // Recipes, cooking, ingredients, kitchen
  'beauty',    // Hair care, skincare, makeup, cosmetics
  'fashion',   // Clothing, shoes, accessories, shapewear
  'home',      // Furniture, mattresses, bedding, home decor
  'health',    // Dental, fitness, supplements, medical
  'tech',      // Electronics, gadgets, apps
  'lifestyle', // General lifestyle, travel, parenting
  'business',  // B2B services, marketing, agency
  'coupon',    // Coupon codes, discounts (entity_type based)
] as const;

/**
 * A trade association's content does not divide into retail categories. Forced
 * through the retail list, every page of an association — dues tiers, a bill in
 * committee, an annual convention — collapses into 'business', which makes any
 * topic-filtered surface either empty or a duplicate of its neighbour.
 */
export const ASSOCIATION_TOPICS = [
  'membership', // Tiers, dues, benefits, joining, renewing, member directory
  'events',     // Conventions, expos, webinars, regional meetings
  'advocacy',   // Legislation, regulation, lobbying, government affairs
  'safety',     // Safety standards, compliance, inspections, driver rules
  'tourism',    // Group travel, tour operators, destinations, itineraries
  'industry',   // Research, statistics, industry news, awards, suppliers
  'business',   // Operations, hiring, running a member company
] as const;

export const VALID_TOPICS = [
  ...RETAIL_TOPICS,
  ...ASSOCIATION_TOPICS.filter((t) => !(RETAIL_TOPICS as readonly string[]).includes(t)),
] as const;

export type ChunkTopic = (typeof VALID_TOPICS)[number];

/** One-line meaning per topic, fed to the classifier so the prompt stays in sync. */
const TOPIC_RULES: Record<string, string> = {
  food: 'recipes, cooking, ingredients, kitchen tools, restaurants',
  beauty: 'hair care, skincare, makeup, cosmetics, beauty treatments',
  fashion: 'clothing, shoes, accessories, shapewear, tights, sunglasses',
  home: 'furniture, mattresses, bedding, home decor, cleaning',
  health: 'dental care, toothbrush, fitness, supplements, medical',
  tech: 'electronics, gadgets, apps, phones',
  lifestyle: 'general lifestyle, travel, parenting, entertainment, general tips',
  business: 'B2B services, marketing, agency work, case studies, hiring, running a company',
  coupon: 'discount codes, promotions, sales',
  membership: 'joining, renewing, dues, membership tiers and benefits, the member directory',
  events: 'conventions, expos, marketplaces, webinars, regional and annual meetings',
  advocacy: 'legislation, regulation, lobbying, government affairs, policy positions',
  safety: 'safety standards, compliance, inspections, driver and vehicle rules',
  tourism: 'group travel, tour operators, destinations, itineraries, passenger experience',
  industry: 'industry research, statistics, news, awards, suppliers and manufacturers',
};

/** Where an unparseable classification lands, per topic set. */
const TOPIC_FALLBACK: Record<string, string> = {
  retail: 'lifestyle',
  association: 'industry',
};

/**
 * The topic vocabulary an account may be classified into. Archetypes that have no
 * vocabulary of their own get the retail list, which is what they have always had.
 */
export function topicsForArchetype(archetype: string | null | undefined): {
  topics: readonly string[];
  fallback: string;
} {
  if (archetype === 'association') {
    return { topics: ASSOCIATION_TOPICS, fallback: TOPIC_FALLBACK.association };
  }
  return { topics: RETAIL_TOPICS, fallback: TOPIC_FALLBACK.retail };
}

/**
 * Classify chunks by topic using Gemini Flash.
 * Only processes chunks that don't have a topic yet.
 */
async function classifyChunkTopics(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  dryRun?: boolean
): Promise<number> {
  const BATCH_SIZE = 30; // Gemini can handle larger batches for simple classification
  let classified = 0;
  let offset = 0;
  const PAGE_SIZE = 1000;

  // The vocabulary depends on the archetype: an association's pages classify into
  // membership/events/advocacy, a shop's into food/beauty/fashion. Reading it here
  // (once) keeps every caller of this function unchanged.
  const { data: acct } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .maybeSingle();
  const { topics: vocabulary, fallback } = topicsForArchetype(
    (acct?.config as Record<string, any> | null)?.archetype,
  );

  while (true) {
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, entity_type, metadata')
      .eq('account_id', accountId)
      .is('topic', null)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (!chunks || chunks.length === 0) break;
    offset += chunks.length;

    // Process in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      // Quick classification: coupon/partnership entity types get auto-classified
      const needsLLM: typeof batch = [];
      const autoClassified: Array<{ id: string; topic: ChunkTopic }> = [];

      for (const c of batch) {
        // Only auto-classify into a topic this account's vocabulary actually has —
        // otherwise the shortcut writes a topic no surface can ever filter on.
        if (c.entity_type === 'coupon' && vocabulary.includes('coupon')) {
          autoClassified.push({ id: c.id, topic: 'coupon' });
        } else if (c.entity_type === 'knowledge_base' && vocabulary.includes('business')) {
          autoClassified.push({ id: c.id, topic: 'business' });
        } else {
          needsLLM.push(c);
        }
      }

      // Save auto-classified
      if (!dryRun && autoClassified.length > 0) {
        for (const item of autoClassified) {
          await supabase
            .from('document_chunks')
            .update({ topic: item.topic })
            .eq('id', item.id);
        }
        classified += autoClassified.length;
      }

      if (needsLLM.length === 0) continue;

      // LLM classification
      try {
        const topics = await classifyTopicsWithLLM(
          needsLLM.map(c => ({ text: c.chunk_text, entityType: c.entity_type })),
          vocabulary,
          fallback,
        );

        if (!dryRun) {
          for (let j = 0; j < needsLLM.length; j++) {
            const topic = topics[j];
            if (topic && vocabulary.includes(topic)) {
              await supabase
                .from('document_chunks')
                .update({ topic })
                .eq('id', needsLLM[j].id);
              classified++;
            }
          }
        } else {
          classified += topics.filter(t => t && vocabulary.includes(t)).length;
        }
      } catch (err: any) {
        log.warn('Topic classification batch failed', { error: err.message }, accountId);
      }
    }
  }

  return classified;
}

/**
 * Classify chunk topics using Gemini Flash.
 */
async function classifyTopicsWithLLM(
  chunks: Array<{ text: string; entityType: string }>,
  vocabulary: readonly string[] = RETAIL_TOPICS,
  fallback: string = TOPIC_FALLBACK.retail,
): Promise<string[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // The rules are generated from the same list the caller validates against, so a
  // vocabulary change can never leave the prompt offering a topic that gets rejected.
  const rules = vocabulary.map((t) => `- ${t}: ${TOPIC_RULES[t] ?? t}`).join('\n');

  const response = await genai.models.generateContent({
    model: 'gemini-3.5-flash',
    config: {
      // Structured output, matching the pattern that works elsewhere in this
      // codebase (complaint-classifier, image-analyzer). The old call asked for a
      // JSON array in prose and regex-matched it back out of free text; when that
      // match failed — which it evidently did, constantly — every chunk in the
      // batch silently took the fallback topic.
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          topics: { type: 'array', items: { type: 'string', enum: [...vocabulary] } },
        },
        required: ['topics'],
      },
      temperature: 0,
      // 30 chunks × a short topic string needs far less than this, but a thinking
      // model spends budget before it emits anything, and running out mid-thought
      // returns empty text. That is the most likely reason this has been silently
      // falling back platform-wide.
      maxOutputTokens: 4000,
    },
    contents: `Classify each text into exactly ONE topic.

Topics: ${vocabulary.join(', ')}

Rules:
${rules}

IMPORTANT: Classify by the PRIMARY topic of the text, not secondary mentions.
- A recipe that mentions a kitchen brand → "food" (not "business")
- A partnership with a hair product → "beauty" (not "business")
- A coupon for a fashion brand → "coupon"
- כנאפה/קדאיף recipe → "food" (NOT beauty, even though קדאיף sounds like hair)
- A convention session about new safety rules → "events" (the text is about the event)
- A press release urging Congress to act → "advocacy" (not "industry")

Only use a topic from the list above. Return ONLY a JSON array of topic strings, one per input.

Texts:
${chunks.map((c, i) => `[${i}] (${c.entityType}) ${c.text.substring(0, 250)}`).join('\n\n')}`,
  });

  const raw = response.text || '';
  try {
    const parsed = JSON.parse(raw);
    const topics = Array.isArray(parsed) ? parsed : parsed?.topics;
    if (Array.isArray(topics) && topics.length > 0) {
      return topics.map((t: unknown) => String(t));
    }
    throw new Error(`no topics array in response (${raw.length} chars)`);
  } catch (err: any) {
    // DO NOT fall back to a default topic here.
    //
    // The previous version returned `chunks.map(() => fallback)` on any parse
    // failure. Because the caller writes whatever comes back, an unparseable
    // response wrote one plausible-looking topic onto every chunk in the batch —
    // indistinguishable from real classification. That is how nearly every
    // account on the platform ended up 100% 'lifestyle' without anyone noticing.
    //
    // Throwing leaves `topic` NULL instead, which is visibly unclassified and can
    // be re-run, and it surfaces in the logs the moment it happens.
    log.warn('Topic classification failed — leaving chunks unclassified', {
      error: err?.message || String(err),
      raw: raw.substring(0, 200),
      batchSize: chunks.length,
    });
    throw err;
  }
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

export { isEnglishHeavy, cleanupTinyChunks, classifyChunkTopics, classifyTopicsWithLLM };
