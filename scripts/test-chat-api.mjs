#!/usr/bin/env node
/**
 * Test Chat API
 * בודק שהצ'אטבוט עובד
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });
config({ path: join(__dirname, '..', '.env.local') });

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testChat(username, message) {
  console.log(`\n🤖 בודק צ'אט עם @${username}...`);
  console.log(`💬 שאלה: "${message}"`);
  
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ API Error (${response.status}): ${error}`);
      return false;
    }

    const data = await response.json();
    
    console.log(`\n✅ תשובה התקבלה:`);
    console.log(`📝 ${data.response?.substring(0, 200)}...`);
    console.log(`\n🔍 מטא-דאטה:`);
    console.log(`   - Session ID: ${data.sessionId || 'N/A'}`);
    console.log(`   - Response ID: ${data.responseId || 'N/A'}`);
    console.log(`   - Trace ID: ${data.traceId || 'N/A'}`);
    console.log(`   - State: ${data.state || 'N/A'}`);
    
    if (data.uiDirectives) {
      console.log(`   - UI Directives: ${Object.keys(data.uiDirectives).join(', ')}`);
    }
    
    if (data.cardsPayload) {
      console.log(`   - Cards: ${data.cardsPayload.type} (${data.cardsPayload.data.length} items)`);
    }
    
    return true;
  } catch (error) {
    console.log(`❌ שגיאה: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 בדיקת Chat API\n');
  console.log('='.repeat(60));
  
  const tests = [
    { username: 'miranbuzaglo', message: 'היי! יש לך קופונים?' },
    { username: 'miranbuzaglo', message: 'ספרי לי על המותגים שלך' },
    { username: 'miranbuzaglo', message: 'מה הקופון של רנואר?' },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await testChat(test.username, test.message);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    console.log('\n' + '-'.repeat(60));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 תוצאות: ${passed}/${tests.length} בדיקות עברו`);
  
  if (failed === 0) {
    console.log('✅ הצ\'אטבוט עובד מעולה! מוכן לטסטים מחר! 🎉\n');
  } else {
    console.log(`⚠️  ${failed} בדיקות נכשלו - צריך לתקן\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
