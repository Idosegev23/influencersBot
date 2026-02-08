// Quick DB check script
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://zwmlqlzfjiminrokzcse.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bWxxbHpmamltaW5yb2t6Y3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY1MTU1NCwiZXhwIjoyMDgxMjI3NTU0fQ._1Mp-ZOxJakkZYGXsIjqITPGBlFWOpHSdL8EDV0J5_8'
);

const accountId = 'e26aa297-c9ec-436e-bf69-73d85ac3dd66';

async function checkData() {
  console.log('\n🔍 Checking data for account:', accountId);
  console.log('='.repeat(60));

  // Check posts
  const { data: posts, count: postsCount } = await supabase
    .from('instagram_posts')
    .select('*', { count: 'exact', head: false })
    .eq('account_id', accountId)
    .limit(5);
  
  console.log(`\n📱 Instagram Posts: ${postsCount || 0}`);
  if (posts && posts.length > 0) {
    console.log(`   Sample: ${posts[0].caption?.substring(0, 60)}...`);
  }

  // Check partnerships/coupons
  const { data: partnerships, count: partnershipsCount } = await supabase
    .from('partnerships')
    .select('*', { count: 'exact', head: false })
    .eq('account_id', accountId);
  
  console.log(`\n🤝 Partnerships: ${partnershipsCount || 0}`);
  if (partnerships && partnerships.length > 0) {
    partnerships.forEach(p => {
      console.log(`   - ${p.brand_name}: ${p.coupon_code || 'no code'}`);
    });
  }

  // Check highlights
  const { data: highlights, count: highlightsCount } = await supabase
    .from('instagram_highlights')
    .select('*', { count: 'exact', head: false })
    .eq('account_id', accountId);
  
  console.log(`\n✨ Highlights: ${highlightsCount || 0}`);

  // Check persona
  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('*')
    .eq('account_id', accountId)
    .single();
  
  console.log(`\n🤖 Persona: ${persona ? '✅ EXISTS' : '❌ MISSING'}`);
  if (persona) {
    console.log(`   Name: ${persona.name}`);
    console.log(`   Tone: ${persona.tone}`);
    console.log(`   Topics: ${persona.topics?.length || 0}`);
  }

  // Check account info
  const { data: account } = await supabase
    .from('accounts')
    .select('instagram_username, status, created_at')
    .eq('id', accountId)
    .single();
  
  console.log(`\n👤 Account Info:`);
  console.log(`   Username: ${account?.instagram_username || 'N/A'}`);
  console.log(`   Status: ${account?.status || 'N/A'}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Check complete!\n');
}

checkData().catch(console.error);
