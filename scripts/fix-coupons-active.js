const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('🔧 מפעיל את כל הקופונים...\n');

  const { error } = await supabase
    .from('coupons')
    .update({ is_active: true })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  if (error) {
    console.error('❌ שגיאה:', error);
  } else {
    console.log('✅ כל הקופונים הופעלו!');
  }

  // בדיקה
  const { data } = await supabase
    .from('coupons')
    .select('code, is_active')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  console.log('\n📊 סטטוס קופונים:');
  data?.forEach(c => {
    console.log(`   ${c.is_active ? '✅' : '❌'} ${c.code}`);
  });
}

main().catch(console.error);
