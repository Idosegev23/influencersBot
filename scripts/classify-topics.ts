/**
 * Classify all existing chunks by topic.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/classify-topics.ts --all
 *   npx tsx --tsconfig tsconfig.json scripts/classify-topics.ts --account <id>
 *   npx tsx --tsconfig tsconfig.json scripts/classify-topics.ts --all --dry-run
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const BATCH_SIZE = 30;

const VALID_TOPICS = [
  'food', 'beauty', 'fashion', 'home', 'health', 'tech', 'lifestyle', 'business', 'coupon',
] as const;
type ChunkTopic = (typeof VALID_TOPICS)[number];

async function classifyTopicsWithLLM(
  chunks: Array<{ text: string; entityType: string }>
): Promise<string[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await genai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Classify each text into exactly ONE topic.

Topics: food, beauty, fashion, home, health, tech, lifestyle, business, coupon

Rules:
- food: recipes, cooking, ingredients, kitchen tools, restaurants
- beauty: hair care, skincare, makeup, cosmetics, beauty treatments
- fashion: clothing, shoes, accessories, shapewear, tights, sunglasses
- home: furniture, mattresses, bedding, home decor, cleaning
- health: dental care, toothbrush, fitness, supplements, medical
- tech: electronics, gadgets, apps, phones
- lifestyle: general lifestyle, travel, parenting, entertainment, general tips
- business: B2B services, marketing, agency work, case studies, hiring
- coupon: discount codes, promotions, sales

IMPORTANT: Classify by the PRIMARY topic of the text, not secondary mentions.
- A recipe that mentions a kitchen brand → "food" (not "business")
- A partnership with a hair product → "beauty" (not "business")
- A coupon for a fashion brand → "coupon"
- כנאפה/קדאיף recipe → "food" (NOT beauty, even though קדאיף sounds like hair)

Return ONLY a JSON array of topic strings. One per input.

Texts:
${chunks.map((c, i) => `[${i}] (${c.entityType}) ${c.text.substring(0, 250)}`).join('\n\n')}`,
    config: {
      temperature: 0,
      maxOutputTokens: 500,
    },
  });

  const raw = response.text || '';
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.warn('Failed to parse topic classification response:', raw.substring(0, 200));
  }

  return chunks.map(() => 'lifestyle');
}

async function classifyAccount(accountId: string, accountName: string, dryRun: boolean) {
  console.log(`\n📋 ${accountName} (${accountId})`);

  const { count: total } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .is('topic', null);

  if (!total) {
    console.log(`  ✅ All chunks already classified`);
    return 0;
  }

  console.log(`  ${total} chunks to classify...`);
  let classified = 0;
  let offset = 0;

  while (true) {
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, entity_type')
      .eq('account_id', accountId)
      .is('topic', null)
      .order('id')
      .range(offset, offset + 999);

    if (!chunks || chunks.length === 0) break;
    offset += chunks.length;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const needsLLM: typeof batch = [];
      const autoClassified: Array<{ id: string; topic: ChunkTopic }> = [];

      for (const c of batch) {
        if (c.entity_type === 'coupon') {
          autoClassified.push({ id: c.id, topic: 'coupon' });
        } else if (c.entity_type === 'knowledge_base') {
          autoClassified.push({ id: c.id, topic: 'business' });
        } else {
          needsLLM.push(c);
        }
      }

      if (!dryRun && autoClassified.length > 0) {
        for (const item of autoClassified) {
          await supabase
            .from('document_chunks')
            .update({ topic: item.topic })
            .eq('id', item.id);
        }
      }
      classified += autoClassified.length;

      if (needsLLM.length === 0) continue;

      try {
        const topics = await classifyTopicsWithLLM(needsLLM.map(c => ({
          text: c.chunk_text,
          entityType: c.entity_type,
        })));

        for (let j = 0; j < needsLLM.length; j++) {
          const topic = topics[j];
          if (topic && (VALID_TOPICS as readonly string[]).includes(topic)) {
            if (!dryRun) {
              await supabase
                .from('document_chunks')
                .update({ topic })
                .eq('id', needsLLM[j].id);
            }
            classified++;
            if (dryRun && j < 3) {
              console.log(`    [${j}] ${topic} ← ${needsLLM[j].chunk_text.substring(0, 60)}...`);
            }
          }
        }
      } catch (err: any) {
        console.error(`  ❌ Batch failed: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }

      process.stdout.write(`  ${classified}/${total} classified\r`);
    }
  }

  console.log(`  ✅ ${classified} chunks classified`);
  return classified;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const accountIdx = args.indexOf('--account');
  const specificAccount = accountIdx >= 0 ? args[accountIdx + 1] : null;

  if (!all && !specificAccount) {
    console.log('Usage: npx tsx --tsconfig tsconfig.json scripts/classify-topics.ts --all [--dry-run]');
    console.log('       npx tsx --tsconfig tsconfig.json scripts/classify-topics.ts --account <id> [--dry-run]');
    process.exit(1);
  }

  if (dryRun) console.log('🔍 DRY RUN — no changes will be made\n');

  let accounts: Array<{ id: string; config: any }>;

  if (specificAccount) {
    const { data } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('id', specificAccount)
      .single();
    accounts = data ? [data] : [];
  } else {
    const { data } = await supabase
      .from('accounts')
      .select('id, config')
      .order('id');
    accounts = data || [];
  }

  console.log(`Found ${accounts.length} accounts\n`);

  let totalClassified = 0;
  for (const account of accounts) {
    const name = (account.config as any)?.username || account.id.slice(0, 8);
    totalClassified += await classifyAccount(account.id, name, dryRun);
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`Total classified: ${totalClassified}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
