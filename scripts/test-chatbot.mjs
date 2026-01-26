#!/usr/bin/env node
/**
 * Chatbot Readiness Test Script
 * בודק שהצ'אטבוט מוכן לטסטים
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(color, symbol, message) {
  console.log(`${COLORS[color]}${symbol}${COLORS.reset} ${message}`);
}

async function main() {
  console.log('\n🤖 Checking Chatbot Readiness...\n');

  let allPassed = true;

  // 1. Check Environment Variables
  console.log('📋 Checking Environment Variables:');
  if (!SUPABASE_URL) {
    log('red', '✗', 'NEXT_PUBLIC_SUPABASE_URL חסר!');
    allPassed = false;
  } else {
    log('green', '✓', `Supabase URL: ${SUPABASE_URL.substring(0, 30)}...`);
  }

  if (!SUPABASE_ANON_KEY) {
    log('red', '✗', 'NEXT_PUBLIC_SUPABASE_ANON_KEY חסר!');
    allPassed = false;
  } else {
    log('green', '✓', 'Supabase Anon Key מוגדר');
  }

  if (!OPENAI_API_KEY) {
    log('red', '✗', 'OPENAI_API_KEY חסר!');
    allPassed = false;
  } else {
    log('green', '✓', 'OpenAI API Key מוגדר');
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('\n❌ לא ניתן להמשיך בלי Supabase credentials\n');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 2. Check Database Tables
  console.log('\n📊 בודק טבלאות:');
  const requiredTables = [
    'influencers',
    'chatbot_persona',
    'chatbot_knowledge_base',
    'partnerships',
    'coupons',
    'roi_tracking',
  ];

  for (const table of requiredTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        log('red', '✗', `טבלה ${table} לא נמצאה או לא נגישה`);
        allPassed = false;
      } else {
        log('green', '✓', `טבלה ${table} קיימת (${count || 0} רשומות)`);
      }
    } catch (err) {
      log('red', '✗', `שגיאה בטבלה ${table}: ${err.message}`);
      allPassed = false;
    }
  }

  // 3. Check Test Influencers
  console.log('\n👥 בודק משפיענים לטסט:');
  const { data: influencers, error: infError } = await supabase
    .from('influencers')
    .select('id, username, display_name, persona, influencer_type')
    .limit(5);

  if (infError || !influencers || influencers.length === 0) {
    log('red', '✗', 'אין משפיענים במערכת!');
    allPassed = false;
  } else {
    log('green', '✓', `נמצאו ${influencers.length} משפיענים:`);
    influencers.forEach(inf => {
      const hasPersona = inf.persona ? '✓' : '✗';
      console.log(`   ${hasPersona} @${inf.username} - ${inf.display_name} (${inf.influencer_type})`);
    });
  }

  // 4. Check Chatbot Persona (new table)
  console.log('\n🎭 בודק Chatbot Persona:');
  const { data: personas, error: personaError } = await supabase
    .from('chatbot_persona')
    .select('account_id, name, tone, language')
    .limit(5);

  if (personaError) {
    log('yellow', '⚠', `שגיאה בטבלת chatbot_persona: ${personaError.message}`);
  } else if (!personas || personas.length === 0) {
    log('yellow', '⚠', 'אין Chatbot Persona - הצ\'אטבוט ישתמש ב-persona הישן');
    console.log('   💡 הצעה: הרץ /api/influencer/chatbot/persona כדי ליצור persona חדש');
  } else {
    log('green', '✓', `נמצאו ${personas.length} personas:`);
    personas.forEach(p => {
      console.log(`   - ${p.name} (${p.tone}, ${p.language})`);
    });
  }

  // 5. Check Partnerships & Coupons
  console.log('\n🤝 בודק שת"פים וקופונים:');
  const { count: partnershipCount } = await supabase
    .from('partnerships')
    .select('*', { count: 'exact', head: true });

  const { count: couponCount } = await supabase
    .from('coupons')
    .select('*', { count: 'exact', head: true });

  if (partnershipCount > 0) {
    log('green', '✓', `${partnershipCount} שת"פים במערכת`);
  } else {
    log('yellow', '⚠', 'אין שת"פים - הצ\'אטבוט יהיה מוגבל');
  }

  if (couponCount > 0) {
    log('green', '✓', `${couponCount} קופונים במערכת`);
  } else {
    log('yellow', '⚠', 'אין קופונים - הצ\'אטבוט לא יוכל להציע קופונים');
    console.log('   💡 הצעה: צור קופונים ב-/api/influencer/partnerships/[id]/coupons');
  }

  // 6. Test OpenAI Connection (if key exists)
  if (OPENAI_API_KEY) {
    console.log('\n🔑 בודק חיבור ל-OpenAI:');
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      });
      
      if (response.ok) {
        log('green', '✓', 'OpenAI API תקין');
      } else {
        log('red', '✗', `OpenAI API error: ${response.status}`);
        allPassed = false;
      }
    } catch (err) {
      log('red', '✗', `שגיאה בחיבור ל-OpenAI: ${err.message}`);
      allPassed = false;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    log('green', '✅', 'כל הבדיקות עברו בהצלחה! הצ\'אטבוט מוכן לטסטים! 🎉');
    console.log('\n📝 צעדים הבאים:');
    console.log('   1. הרץ: npm run dev');
    console.log('   2. פתח: http://localhost:3000/chat/[username]');
    console.log('   3. החלף [username] באחד מהמשפיענים למעלה');
    console.log('   4. התחל לשאול שאלות!\n');
  } else {
    log('red', '❌', 'יש בעיות שצריך לתקן לפני הטסטים');
    console.log('\n📝 תקן את הבעיות המסומנות ב-✗ והרץ שוב\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ שגיאה:', err.message);
  process.exit(1);
});
