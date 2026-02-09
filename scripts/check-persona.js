const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  const { data, error } = await supabase
    .from('chatbot_persona')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n🎯 **PERSONA של מירן בוזגלו**');
  console.log('═'.repeat(80));
  console.log('\n📝 **Bio:**');
  console.log(data.bio);
  console.log('\n📖 **Description:**');
  console.log(data.description);
  console.log('\n🎨 **Tone:**');
  console.log(data.tone);
  console.log('\n🗣️ **Response Style:**');
  console.log(data.response_style);
  console.log('\n🎯 **Interests:**');
  console.log(data.interests);
  console.log('\n📚 **Topics:**');
  console.log(data.topics);
  
  if (data.metadata?.ultimate_scan) {
    console.log('\n\n🔥 **ULTIMATE SCAN INFO:**');
    console.log('═'.repeat(80));
    console.log(JSON.stringify(data.metadata.ultimate_scan, null, 2));
  }
  
  if (data.metadata?.persona) {
    console.log('\n\n🤖 **FULL PERSONA ANALYSIS:**');
    console.log('═'.repeat(80));
    console.log(JSON.stringify(data.metadata.persona, null, 2));
  }
}

main().catch(console.error);
