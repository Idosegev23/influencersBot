import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { retrieveContext } from '@/lib/rag/retrieve';
import { createClient } from '@/lib/supabase/server';

const query = process.argv[2] || 'יש לך המלצה למחטב?';
const accountId = process.argv[3] || '038fd490-906d-431f-b428-ff9203ce4968';

async function main() {
  console.log(`Query: "${query}"`);
  console.log(`Account: ${accountId}\n`);

  const r = await retrieveContext({ query, accountId });

  // Get chunk IDs and look up their topics from DB
  const chunkIds = r.sources.map(s => s.sourceId);
  const supabase = createClient();
  const { data: topicData } = await supabase
    .from('document_chunks')
    .select('id, topic')
    .in('id', chunkIds);
  const topicMap = new Map((topicData || []).map(d => [d.id, d.topic]));

  console.log(`Chunks returned: ${r.sources.length}`);
  console.log(`InferredTopics from debug: ${JSON.stringify((r.debug as any)?.inferredTopics || 'N/A')}\n`);

  for (const c of r.sources) {
    const text = (c.excerpt || '').substring(0, 100).replace(/\n/g, ' ');
    const sim = r.debug?.similarityScores?.[c.sourceId] || c.confidence;
    const dbTopic = topicMap.get(c.sourceId) || 'null';
    console.log(`sim=${sim.toFixed(3)} db_topic=${dbTopic} type=${c.entityType}`);
    console.log(`  ${text}\n`);
  }
}

main().catch(e => console.error(e));
