const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('\n🔍 **מותגים קיימים:**');
  console.log('═'.repeat(80));
  
  const { data: partnerships } = await supabase
    .from('partnerships')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  partnerships?.forEach(p => {
    console.log(`\n📦 ${p.brand_name}`);
    console.log(`   קטגוריה: ${p.category || 'לא מוגדר'}`);
    console.log(`   תיאור: ${p.brief || 'אין'}`);
    console.log(`   לינק: ${p.link || 'אין'}`);
  });

  console.log('\n\n🎟️ **קופונים קיימים:**');
  console.log('═'.repeat(80));
  
  const { data: coupons } = await supabase
    .from('coupons')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID);

  coupons?.forEach(c => {
    console.log(`\n🎫 ${c.code}`);
    console.log(`   מותג: ${c.brand_name || 'לא מוגדר'}`);
    console.log(`   תיאור: ${c.description || 'אין'}`);
    console.log(`   הנחה: ${c.discount_type === 'percentage' ? c.discount_value + '%' : c.discount_value + ' ש"ח'}`);
    console.log(`   תוקף: ${c.expires_at || 'ללא תאריך'}`);
    console.log(`   פעיל: ${c.active ? '✅' : '❌'}`);
  });

  console.log('\n\n📊 **סיכום:**');
  console.log(`   • ${partnerships?.length || 0} שותפויות`);
  console.log(`   • ${coupons?.length || 0} קופונים`);
}

main().catch(console.error);
