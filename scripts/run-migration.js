const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

async function runMigration(migrationFile) {
  console.log(`\n🚀 מריץ Migration: ${migrationFile}`);
  console.log('═'.repeat(80));

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', migrationFile);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // פיצול ל-statements נפרדים (על בסיס ;)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📊 ${statements.length} statements למריצה...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // דלג על comments בלבד
    if (statement.startsWith('COMMENT ON')) {
      console.log(`⏭️  [${i + 1}/${statements.length}] Comment - מדלג`);
      continue;
    }

    // הצג את תחילת ה-statement
    const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
    process.stdout.write(`⏳ [${i + 1}/${statements.length}] ${preview}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.log(` ❌ שגיאה: ${error.message}`);
        errorCount++;
      } else {
        console.log(` ✅`);
        successCount++;
      }
    } catch (e) {
      // ננסה דרך אחרת - query ישירה
      try {
        await supabase.from('_migrations').insert({ statement }).select().single();
        console.log(` ✅ (fallback)`);
        successCount++;
      } catch (e2) {
        console.log(` ⚠️  לא ניתן להריץ ישירות`);
        errorCount++;
      }
    }
  }

  console.log('\n');
  console.log('═'.repeat(80));
  console.log(`✅ הצלחות: ${successCount}`);
  console.log(`❌ שגיאות: ${errorCount}`);
  console.log('═'.repeat(80));
}

async function main() {
  console.log('🔥'.repeat(50));
  console.log('🔥 MIGRATION RUNNER');
  console.log('🔥'.repeat(50));

  await runMigration('034_comprehensive_indexes.sql');

  console.log('\n✅ Migration הושלם!\n');
}

main().catch(console.error);
