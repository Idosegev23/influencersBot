/**
 * Test RAG search locally
 * npx tsx --tsconfig tsconfig.json scripts/test-rag-search.ts "פסטה בסיר אחד"
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const query = process.argv[2] || 'פסטה בסיר אחד';
  const accountId = process.argv[3] || '038fd490-906d-431f-b428-ff9203ce4968';

  console.log(`\n🔍 Testing RAG search for: "${query}"`);
  console.log(`   Account: ${accountId}\n`);

  // Test 1: RAG vector search
  console.log('=== TEST 1: RAG Vector Search (document_chunks) ===');
  try {
    const { retrieveContext } = await import('../src/lib/rag/retrieve');
    const result = await retrieveContext({
      accountId,
      query,
      topK: 10,
    });
    console.log(`Found ${result.sources.length} sources:`);
    for (const s of result.sources) {
      console.log(`  [${s.entityType}] sim=${s.confidence.toFixed(3)} | ${s.title?.substring(0, 60) || s.excerpt.substring(0, 60)}`);
    }
    if (result.sources.length === 0) {
      console.log('  ❌ No results from vector search!');
    }
  } catch (err: any) {
    console.error('  ❌ RAG error:', err.message);
  }

  // Test 2: Direct keyword search in document_chunks
  console.log('\n=== TEST 2: Keyword search in document_chunks ===');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, entity_type, chunk_text, metadata')
      .eq('account_id', accountId)
      .ilike('chunk_text', '%פסטה%סיר אחד%')
      .limit(5);

    if (error) {
      console.log('  ❌ Error:', error.message);
    } else {
      console.log(`Found ${data?.length || 0} chunks with keyword match:`);
      for (const d of data || []) {
        console.log(`  [${d.entity_type}] ${d.chunk_text.substring(0, 100)}...`);
      }
    }
  } catch (err: any) {
    console.error('  ❌ DB error:', err.message);
  }

  // Test 3: Full knowledge retrieval (what the chatbot actually uses)
  console.log('\n=== TEST 3: Full Knowledge Retrieval (sandwich bot path) ===');
  try {
    const { retrieveKnowledge } = await import('../src/lib/chatbot/knowledge-retrieval');
    const knowledge = await retrieveKnowledge(
      accountId,
      'base',
      query,
      10,
    );
    console.log('Results:');
    console.log(`  Posts: ${knowledge.posts.length}`);
    console.log(`  Transcriptions: ${knowledge.transcriptions.length}`);
    console.log(`  Highlights: ${knowledge.highlights.length}`);
    console.log(`  Websites: ${knowledge.websites.length}`);
    console.log(`  Coupons: ${knowledge.coupons.length}`);
    console.log(`  Partnerships: ${knowledge.partnerships.length}`);

    // Show website results
    if (knowledge.websites.length > 0) {
      console.log('\n  Website results:');
      for (const w of knowledge.websites.slice(0, 5)) {
        console.log(`    - ${w.title?.substring(0, 60)} (${w.content?.length || 0} chars)`);
      }
    }

    // Check if pasta recipe is in any of the results
    const allText = [
      ...knowledge.posts.map(p => p.caption),
      ...knowledge.transcriptions.map(t => t.text),
      ...knowledge.websites.map(w => w.content),
    ].join(' ');

    const hasPasta = allText.includes('פסטה') && allText.includes('סיר אחד');
    console.log(`\n  🔎 Contains "פסטה בסיר אחד": ${hasPasta ? '✅ YES' : '❌ NO'}`);

  } catch (err: any) {
    console.error('  ❌ Knowledge retrieval error:', err.message);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
