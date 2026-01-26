#!/usr/bin/env node

/**
 * 🚀 סקריפט להרצת מיגרציות דרך Supabase REST API
 * 
 * שימוש:
 * 1. ודא שיש לך SUPABASE_SERVICE_ROLE_KEY ב-.env
 * 2. הרץ: node scripts/run-migrations-api.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// קריאת environment variables
const envFile = readFileSync(join(rootDir, '.env'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ חסר SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY ב-.env');
  console.error('');
  console.error('📋 כדי לקבל את ה-SERVICE_ROLE_KEY:');
  console.error('   1. לך ל-https://supabase.com/dashboard');
  console.error('   2. בחר את הפרויקט שלך');
  console.error('   3. Settings → API');
  console.error('   4. העתק את "service_role" key (secret!)');
  console.error('   5. הוסף ל-.env: SUPABASE_SERVICE_ROLE_KEY=...');
  console.error('');
  console.error('⚠️  או השתמש במדריך הידני: HOW_TO_RUN_MIGRATIONS.md');
  process.exit(1);
}

// רשימת מיגרציות
const migrations = [
  'supabase/migrations/016_add_copy_tracking.sql',
  'supabase/migrations/017_satisfaction_surveys.sql',
];

console.log('');
console.log('🚀 מריץ מיגרציות...');
console.log('====================================');
console.log('');

async function runMigration(filePath) {
  try {
    const sql = readFileSync(join(rootDir, filePath), 'utf-8');
    const fileName = filePath.split('/').pop();
    
    console.log(`▶️  ${fileName}...`);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    console.log(`   ✅ הצלחה!\n`);
    return true;
  } catch (error) {
    console.error(`   ❌ שגיאה: ${error.message}\n`);
    return false;
  }
}

// הרצת כל המיגרציות
let success = true;
for (const migration of migrations) {
  const result = await runMigration(migration);
  if (!result) {
    success = false;
    break;
  }
}

console.log('====================================');
if (success) {
  console.log('🎉 כל המיגרציות הושלמו בהצלחה!');
  console.log('');
  console.log('🚀 המערכת מוכנה לשימוש!');
} else {
  console.log('❌ חלק מהמיגרציות נכשלו');
  console.log('');
  console.log('💡 נסה להריץ ידנית דרך Supabase Dashboard');
  console.log('   ראה: HOW_TO_RUN_MIGRATIONS.md');
  process.exit(1);
}
console.log('');
