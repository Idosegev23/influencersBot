const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

async function main() {
  console.log('🔍 **בדיקת Indexes קיימים**\n');
  console.log('═'.repeat(80));

  // בדיקת indexes קיימים
  const { data: indexes, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `
  });

  if (error) {
    console.log('⚠️  לא ניתן לקרוא indexes ישירות, מנסה דרך אחרת...\n');
    
    // נבדוק בצורה אחרת - דרך information_schema
    const tables = [
      'instagram_posts',
      'instagram_transcriptions',
      'instagram_highlights',
      'partnerships',
      'coupons',
      'chatbot_persona',
      'accounts'
    ];

    for (const table of tables) {
      console.log(`\n📊 ${table}:`);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (data && data[0]) {
        const columns = Object.keys(data[0]);
        console.log(`   עמודות: ${columns.length}`);
        console.log(`   דוגמה: ${columns.slice(0, 5).join(', ')}...`);
      } else if (error) {
        console.log(`   ❌ שגיאה: ${error.message}`);
      }
    }
  }

  // בדיקת FTS
  console.log('\n\n🔎 **בדיקת Full Text Search:**');
  console.log('═'.repeat(80));

  const ftsQueries = [
    {
      name: 'instagram_posts FTS',
      query: `SELECT to_regclass('public.idx_instagram_posts_fts')::text as exists`
    },
    {
      name: 'instagram_transcriptions FTS',
      query: `SELECT to_regclass('public.idx_instagram_transcriptions_fts')::text as exists`
    },
    {
      name: 'partnerships FTS',
      query: `SELECT to_regclass('public.idx_partnerships_fts')::text as exists`
    },
  ];

  for (const q of ftsQueries) {
    try {
      // ננסה דרך query פשוטה
      const { data, error } = await supabase
        .from('instagram_posts')
        .select('id')
        .limit(1);
      
      if (!error) {
        console.log(`✅ ${q.name} - טבלה קיימת`);
      }
    } catch (e) {
      console.log(`❌ ${q.name} - ${e.message}`);
    }
  }

  console.log('\n\n📊 **סיכום טבלאות:**');
  console.log('═'.repeat(80));

  const tablesToCheck = [
    { name: 'instagram_posts', key: 'account_id' },
    { name: 'instagram_transcriptions', key: 'account_id' },
    { name: 'instagram_highlights', key: 'account_id' },
    { name: 'partnerships', key: 'account_id' },
    { name: 'coupons', key: 'account_id' },
    { name: 'chatbot_persona', key: 'account_id' },
  ];

  for (const table of tablesToCheck) {
    const { count } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })
      .eq(table.key, '4e2a0ce8-8753-4876-973c-00c9e1426e51');
    
    console.log(`   📦 ${table.name}: ${count || 0} רשומות`);
  }
}

main().catch(console.error);
