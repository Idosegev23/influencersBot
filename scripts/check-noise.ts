import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { retrieveContext } from '@/lib/rag/retrieve';
import { createClient } from '@/lib/supabase/server';

const noiseQueries = [
  { query: 'יש לך המלצה לקפוצ\'ון?', noise: ['מתכון', 'בשר'] },
  { query: 'איפה אפשר לקנות בגדים?', noise: ['מתכון', 'בשר'] },
];

async function main() {
  for (const { query, noise } of noiseQueries) {
    console.log(`\n=== ${query} ===`);
    const r = await retrieveContext({ query, accountId: '038fd490-906d-431f-b428-ff9203ce4968' });
    const allText = r.sources.map(s => s.excerpt || '').join('\n');

    const supabase = createClient();
    const chunkIds = r.sources.map(s => s.sourceId);
    const { data: topicData } = await supabase.from('document_chunks').select('id, topic').in('id', chunkIds);
    const topicMap = new Map((topicData || []).map(d => [d.id, d.topic]));

    for (let i = 0; i < r.sources.length; i++) {
      const s = r.sources[i];
      const t = s.excerpt || '';
      const dbTopic = topicMap.get(s.sourceId) || 'null';
      const sim = r.debug?.similarityScores?.[s.sourceId] || s.confidence;
      const hasNoise = noise.some(n => t.includes(n));
      if (hasNoise) {
        const found = noise.filter(n => t.includes(n));
        console.log(`  [${i}] sim=${sim.toFixed(3)} topic=${dbTopic} type=${s.entityType} NOISE: ${found.join(', ')}`);
        console.log(`       ${t.substring(0, 120).replace(/\n/g, ' ')}`);
      }
    }
  }
}

main().catch(e => console.error(e)).finally(() => process.exit(0));
