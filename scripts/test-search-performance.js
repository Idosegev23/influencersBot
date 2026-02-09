const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function testSearch(funcName, query, limit = 10) {
  const start = Date.now();
  const { data, error } = await supabase.rpc(funcName, {
    p_account_id: MIRAN_ACCOUNT_ID,
    p_query: query,
    p_limit: limit,
  });
  const duration = Date.now() - start;

  if (error) {
    console.log(`❌ ${funcName}: ${error.message}`);
    return;
  }

  console.log(`✅ ${funcName}("${query}")`);
  console.log(`   ⚡ ${duration}ms | ${data?.length || 0} תוצאות`);
  
  if (data && data.length > 0) {
    const first = data[0];
    if (first.brand_name) {
      console.log(`   📦 ${first.brand_name} (${first.category || 'N/A'})`);
    } else if (first.code) {
      console.log(`   🎫 ${first.code} - ${first.brand_name}`);
    } else if (first.caption) {
      console.log(`   📝 ${first.caption.substring(0, 60)}...`);
    } else if (first.content_type) {
      console.log(`   📄 ${first.content_type}: ${first.content_text?.substring(0, 50)}...`);
    }
  }
  console.log('');
}

async function main() {
  console.log('🚀 **בדיקת מהירות חיפוש**');
  console.log('═'.repeat(80));
  console.log('');

  // חיפוש מותגים
  console.log('📦 **חיפוש מותגים:**');
  await testSearch('search_partnerships', 'טיפוח');
  await testSearch('search_partnerships', 'איפור');
  await testSearch('search_partnerships', 'spring');

  // חיפוש קופונים
  console.log('🎫 **חיפוש קופונים:**');
  await testSearch('search_coupons', 'miran');
  await testSearch('search_coupons', 'spring');
  await testSearch('search_coupons', 'הנחה');

  // חיפוש פוסטים
  console.log('📝 **חיפוש פוסטים:**');
  await testSearch('search_posts', 'ביוטי');
  await testSearch('search_posts', 'משפחה');

  // חיפוש תמלולים
  console.log('🎬 **חיפוש תמלולים:**');
  await testSearch('search_transcriptions', 'מתכון');
  await testSearch('search_transcriptions', 'איפור');

  // חיפוש הכל
  console.log('🔍 **חיפוש כולל (הכל):**');
  await testSearch('search_everything', 'מירן טיפוח', 20);
  await testSearch('search_everything', 'spring blossom', 20);

  console.log('');
  console.log('✅ **כל הבדיקות הושלמו!**');
}

main().catch(console.error);
