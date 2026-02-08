// List all accounts
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://zwmlqlzfjiminrokzcse.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bWxxbHpmamltaW5yb2t6Y3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY1MTU1NCwiZXhwIjoyMDgxMjI3NTU0fQ._1Mp-ZOxJakkZYGXsIjqITPGBlFWOpHSdL8EDV0J5_8'
);

async function listAccounts() {
  console.log('\n📋 Listing all accounts...\n');

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, instagram_username, account_type, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!accounts || accounts.length === 0) {
    console.log('❌ No accounts found!\n');
    return;
  }

  console.log(`Found ${accounts.length} accounts:\n`);
  accounts.forEach((acc, i) => {
    console.log(`${i + 1}. ${acc.instagram_username || 'NO USERNAME'}`);
    console.log(`   ID: ${acc.id}`);
    console.log(`   Type: ${acc.account_type}`);
    console.log(`   Status: ${acc.status}`);
    console.log(`   Created: ${new Date(acc.created_at).toLocaleString('he-IL')}`);
    console.log('');
  });

  // Check for 'the_dekel'
  const dekelAccount = accounts.find(a => a.instagram_username === 'the_dekel');
  if (dekelAccount) {
    console.log('✅ Found @the_dekel account!');
    console.log(`   Use this ID: ${dekelAccount.id}\n`);
  } else {
    console.log('⚠️  @the_dekel not found in accounts table!\n');
  }
}

listAccounts().catch(console.error);
