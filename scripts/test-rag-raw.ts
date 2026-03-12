/**
 * Test RAG raw vector search + keyword search to find the exact chunk
 * npx tsx --tsconfig tsconfig.json scripts/test-rag-raw.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const query = 'פסטה בסיר אחד';
  const accountId = '038fd490-906d-431f-b428-ff9203ce4968';

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  // 1. Generate embedding for query
  console.log('🔤 Generating embedding for:', query);
  const { generateEmbedding } = await import('../src/lib/rag/embeddings');
  const embedding = await generateEmbedding(query);

  // 2. Raw vector search — ALL results above threshold 0.2
  console.log('\n=== RAW VECTOR SEARCH (threshold=0.2, limit=50) ===');
  const { data: vectorResults, error } = await supabase
    .rpc('match_document_chunks', {
      p_account_id: accountId,
      p_embedding: JSON.stringify(embedding),
      p_match_count: 50,
      p_match_threshold: 0.2,
      p_entity_types: null,
      p_updated_after: null,
    });

  if (error) {
    console.error('Vector search error:', error);
  } else {
    console.log(`Total candidates: ${vectorResults.length}`);

    // Find the "סיר אחד" chunk
    const sirEchad = vectorResults.filter((r: any) =>
      r.chunk_text.includes('סיר אחד') || r.chunk_text.includes('פסטה עגבניות בסיר')
    );

    if (sirEchad.length > 0) {
      console.log(`\n✅ Found "סיר אחד" chunks in vector results:`);
      for (const r of sirEchad) {
        console.log(`  sim=${r.similarity.toFixed(3)} [${r.entity_type}] ${r.chunk_text.substring(0, 120)}...`);
      }
    } else {
      console.log(`\n❌ "סיר אחד" NOT found in top 50 vector results`);
      console.log(`Lowest similarity in results: ${vectorResults[vectorResults.length - 1]?.similarity.toFixed(3)}`);
    }

    // Show top 5
    console.log('\nTop 5 results:');
    for (const r of vectorResults.slice(0, 5)) {
      const title = r.metadata?.title || r.chunk_text.substring(0, 80);
      console.log(`  sim=${r.similarity.toFixed(3)} [${r.entity_type}] ${title}`);
    }
  }

  // 3. Direct keyword search in document_chunks
  console.log('\n=== KEYWORD SEARCH in document_chunks ===');
  const { data: keywordResults } = await supabase
    .from('document_chunks')
    .select('id, entity_type, chunk_text, metadata')
    .eq('account_id', accountId)
    .ilike('chunk_text', '%סיר אחד%')
    .limit(10);

  console.log(`Found ${keywordResults?.length || 0} keyword matches:`);
  for (const r of keywordResults || []) {
    console.log(`  [${r.entity_type}] ${r.chunk_text.substring(0, 120)}...`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
