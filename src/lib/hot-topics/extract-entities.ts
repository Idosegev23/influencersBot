/**
 * Entity Extraction for News/Entertainment Content
 *
 * Uses Gemini 2.0 Flash to extract named entities (people, shows, events, scandals)
 * from Hebrew news/entertainment text chunks.
 *
 * Called from:
 * - enrich.ts Step 6 (during RAG ingestion for media_news accounts)
 * - Backfill script (one-time for existing chunks)
 */

import { GoogleGenAI } from '@google/genai';
import type { EntityMention } from './types';

const BATCH_SIZE = 20;

/**
 * Extract entities from a batch of text chunks.
 * Returns an array of entity arrays (one per input text).
 */
export async function extractEntitiesBatch(
  texts: Array<{ id: string; text: string; entityType: string }>,
  options?: { geminiApiKey?: string }
): Promise<Array<EntityMention[]>> {
  const apiKey = options?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[extract-entities] No GEMINI_API_KEY, skipping');
    return texts.map(() => []);
  }

  const genai = new GoogleGenAI({ apiKey });

  const response = await genai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Extract named entities from these Hebrew news/entertainment texts.

For each text, return a JSON array of objects with "name" and "type" fields.

Entity types:
- "person": Celebrity names, reality TV stars, musicians, politicians, public figures, influencers
- "show": TV shows, reality shows, podcasts, YouTube channels, radio programs
- "event": Concerts, festivals, ceremonies, awards, premieres, weddings, funerals
- "scandal": Controversies, leaked content, public disputes, legal cases, breakups, cheating
- "general": Other trending topics that don't fit above (e.g. "קורונה", "מלחמה")

Rules:
- Extract ONLY proper nouns and specific named entities, not generic words
- For Hebrew names, use the most common spelling
- A person involved in a scandal should be tagged as "person", not "scandal" — "scandal" is for the event itself
- If the same person appears multiple times, include them only once
- Return an empty array [] if no entities found
- Return ONLY a JSON array of arrays. One inner array per input text.

Texts:
${texts.map((t, i) => `[${i}] (${t.entityType}) ${t.text.substring(0, 400)}`).join('\n\n')}`,
    config: {
      temperature: 0,
      maxOutputTokens: 2000,
    },
  });

  const raw = response.text || '';
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Handle both [[{...}]] and [{...}] formats
      if (parsed.length > 0 && Array.isArray(parsed[0])) {
        return parsed.map((arr: any[]) => validateEntities(arr));
      }
      // Single array — wrap if texts.length === 1
      if (texts.length === 1) {
        return [validateEntities(parsed)];
      }
    }
  } catch (err) {
    console.warn('[extract-entities] Failed to parse response', {
      raw: raw.substring(0, 300),
      error: (err as Error).message,
    });
  }

  return texts.map(() => []);
}

/**
 * Process all unenriched chunks for an account in batches.
 * Returns total number of entities extracted.
 */
export async function extractEntitiesForAccount(
  accountId: string,
  chunks: Array<{ id: string; chunk_text: string; entity_type: string; metadata: Record<string, unknown> | null }>,
  options?: { dryRun?: boolean; geminiApiKey?: string }
): Promise<{ extracted: number; errors: string[] }> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();

  // Filter to chunks without entities yet
  const unenriched = chunks.filter(
    (c) => !c.metadata?.entities_extracted
  );

  if (unenriched.length === 0) {
    return { extracted: 0, errors: [] };
  }

  console.log(`[extract-entities] Processing ${unenriched.length} chunks for account ${accountId}`);

  let totalExtracted = 0;
  const errors: string[] = [];

  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    const batch = unenriched.slice(i, i + BATCH_SIZE);
    const batchTexts = batch.map((c) => ({
      id: c.id,
      text: c.chunk_text,
      entityType: c.entity_type,
    }));

    try {
      const results = await extractEntitiesBatch(batchTexts, options);

      if (options?.dryRun) {
        for (let j = 0; j < results.length; j++) {
          if (results[j].length > 0) {
            console.log(`[extract-entities] [DRY RUN] Chunk ${batch[j].id}: ${JSON.stringify(results[j])}`);
            totalExtracted += results[j].length;
          }
        }
        continue;
      }

      // Update each chunk's metadata
      for (let j = 0; j < results.length; j++) {
        const entities = results[j];
        const chunk = batch[j];
        const newMetadata = {
          ...(chunk.metadata || {}),
          entities,
          entities_extracted: true,
        };

        const { error } = await supabase
          .from('document_chunks')
          .update({ metadata: newMetadata })
          .eq('id', chunk.id);

        if (error) {
          errors.push(`Chunk ${chunk.id}: ${error.message}`);
        } else {
          totalExtracted += entities.length;
        }
      }
    } catch (err) {
      const msg = `Batch ${i}-${i + batch.length}: ${(err as Error).message}`;
      errors.push(msg);
      console.error(`[extract-entities] ${msg}`);
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < unenriched.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[extract-entities] Done: ${totalExtracted} entities from ${unenriched.length} chunks`);
  return { extracted: totalExtracted, errors };
}

function validateEntities(arr: unknown[]): EntityMention[] {
  const validTypes = new Set(['person', 'event', 'show', 'scandal', 'general']);
  return arr
    .filter(
      (e: any) =>
        e &&
        typeof e.name === 'string' &&
        e.name.length > 1 &&
        typeof e.type === 'string' &&
        validTypes.has(e.type)
    )
    .map((e: any) => ({ name: e.name.trim(), type: e.type }));
}
