const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

async function main() {
  console.log('\n📊 partnerships table:');
  const { data: p1 } = await supabase.from('partnerships').select('*').limit(1);
  if (p1 && p1[0]) {
    console.log('Columns:', Object.keys(p1[0]).join(', '));
  }

  console.log('\n🎟️ coupons table:');
  const { data: c1 } = await supabase.from('coupons').select('*').limit(1);
  if (c1 && c1[0]) {
    console.log('Columns:', Object.keys(c1[0]).join(', '));
  }
}

main().catch(console.error);
