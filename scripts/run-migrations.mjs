import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase credentials
const SUPABASE_URL = 'https://zwmlqlzfjiminrokzcse.supabase.co';
const SUPABASE_SERVICE_KEY = 'sbp_8acd6a360d621c1b237f0e1c2f8eac3e1579a1f4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration(filepath, name) {
  console.log(`\n🔄 Running ${name}...`);
  
  try {
    const sql = readFileSync(filepath, 'utf-8');
    
    // Split by semicolons and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`   Found ${statements.length} SQL statements`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip comments and empty statements
      if (statement.trim().startsWith('--') || statement.trim() === ';') {
        continue;
      }
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: statement
        });
        
        if (error) {
          console.error(`   ❌ Statement ${i + 1} failed:`, error.message);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`   ❌ Statement ${i + 1} error:`, err.message);
        errorCount++;
      }
    }
    
    console.log(`✅ ${name} completed: ${successCount} success, ${errorCount} errors`);
    return errorCount === 0;
    
  } catch (error) {
    console.error(`❌ Failed to run ${name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting migrations...\n');
  
  const migrations = [
    {
      file: join(__dirname, '../supabase/migrations/010_storage_setup.sql'),
      name: 'Migration 010: Storage Setup'
    },
    {
      file: join(__dirname, '../supabase/migrations/011_notification_engine.sql'),
      name: 'Migration 011: Notification Engine'
    },
    {
      file: join(__dirname, '../supabase/migrations/012_coupons_roi.sql'),
      name: 'Migration 012: Coupons & ROI'
    }
  ];
  
  let allSuccess = true;
  
  for (const migration of migrations) {
    const success = await runMigration(migration.file, migration.name);
    if (!success) {
      allSuccess = false;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  if (allSuccess) {
    console.log('✅ All migrations completed successfully!');
  } else {
    console.log('⚠️  Some migrations had errors. Check logs above.');
  }
  console.log('='.repeat(50) + '\n');
}

main().catch(console.error);
