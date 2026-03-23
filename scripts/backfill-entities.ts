/**
 * Backfill entity extraction for media_news accounts.
 * Run: npx tsx scripts/backfill-entities.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get media_news accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active');

  const newsAccounts = (accounts || []).filter(
    (a: any) => (a.config as any)?.archetype === 'media_news'
  );

  console.log(`Found ${newsAccounts.length} media_news accounts`);

  for (const account of newsAccounts) {
    const username = (account.config as any)?.username;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing: ${username} (${account.id})`);

    // Load chunks without entities
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, entity_type, metadata, token_count')
      .eq('account_id', account.id)
      .in('entity_type', ['post', 'transcription', 'highlight'])
      .gt('token_count', 25);

    if (error) {
      console.error(`  Error loading chunks: ${error.message}`);
      continue;
    }

    const unenriched = (chunks || []).filter(
      (c: any) => !c.metadata?.entities_extracted
    );

    console.log(`  Total chunks: ${chunks?.length || 0}`);
    console.log(`  Need entity extraction: ${unenriched.length}`);

    if (unenriched.length === 0) {
      console.log('  Skipping — all chunks already have entities');
      continue;
    }

    // Process in batches using Gemini
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const BATCH_SIZE = 20;
    let totalExtracted = 0;
    let batchNum = 0;

    for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
      batchNum++;
      const batch = unenriched.slice(i, i + BATCH_SIZE);

      const texts = batch.map((c: any, idx: number) =>
        `[${idx}] (${c.entity_type}) ${c.chunk_text.substring(0, 400)}`
      ).join('\n\n');

      try {
        const response = await genai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `Extract named entities from these Hebrew news/entertainment texts.

For each text, return a JSON array of objects with "name" and "type" fields.

Entity types:
- "person": Celebrity names, reality TV stars, musicians, politicians, public figures, influencers
- "show": TV shows, reality shows, podcasts, YouTube channels, radio programs
- "event": Concerts, festivals, ceremonies, awards, premieres, weddings, funerals
- "scandal": Controversies, leaked content, public disputes, legal cases, breakups, cheating
- "general": Other trending topics

Rules:
- Extract ONLY proper nouns and specific named entities
- For Hebrew names, use the most common spelling
- A person in a scandal → "person", not "scandal"
- Return an empty array [] if no entities found
- Return ONLY a JSON array of arrays. One inner array per input text.

Texts:
${texts}`,
          config: { temperature: 0, maxOutputTokens: 2000 },
        });

        const raw = response.text || '';
        let results: any[][] = [];

        try {
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.length > 0 && Array.isArray(parsed[0])) {
              results = parsed;
            } else if (batch.length === 1) {
              results = [parsed];
            }
          }
        } catch {
          console.log(`  Batch ${batchNum}: Failed to parse, skipping`);
          continue;
        }

        // Update each chunk
        let batchExtracted = 0;
        for (let j = 0; j < Math.min(results.length, batch.length); j++) {
          const entities = (results[j] || []).filter(
            (e: any) => e && typeof e.name === 'string' && e.name.length > 1 && typeof e.type === 'string'
          ).map((e: any) => ({ name: e.name.trim(), type: e.type }));

          const chunk = batch[j] as any;
          const newMetadata = {
            ...(chunk.metadata || {}),
            entities,
            entities_extracted: true,
          };

          const { error: updateErr } = await supabase
            .from('document_chunks')
            .update({ metadata: newMetadata })
            .eq('id', chunk.id);

          if (!updateErr) {
            batchExtracted += entities.length;
          }
        }

        totalExtracted += batchExtracted;
        console.log(`  Batch ${batchNum}/${Math.ceil(unenriched.length / BATCH_SIZE)}: ${batchExtracted} entities`);

        // Rate limit
        if (i + BATCH_SIZE < unenriched.length) {
          await new Promise(r => setTimeout(r, 600));
        }
      } catch (err: any) {
        console.error(`  Batch ${batchNum} error: ${err.message}`);
      }
    }

    console.log(`  Done: ${totalExtracted} total entities extracted`);
  }

  console.log('\n\nBackfill complete!');
}

main().catch(console.error);
