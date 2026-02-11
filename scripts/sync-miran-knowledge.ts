/**
 * Script: Sync Miran's knowledge base
 * סינכרון מסד ידע למירן
 */

import { syncKnowledgeBase } from '../src/lib/chatbot/knowledge-sync';

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

async function main() {
  console.log('🔄 Syncing knowledge base for Miran...\n');

  try {
    const result = await syncKnowledgeBase(MIRAN_ACCOUNT_ID);
    
    if (result.success) {
      console.log('\n✅ Knowledge base synced successfully!');
    } else {
      console.error('\n❌ Sync failed');
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
