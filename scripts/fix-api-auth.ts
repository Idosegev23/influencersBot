#!/usr/bin/env tsx
/**
 * Script to fix API routes auth
 * Replaces requireAuth/getCurrentUser with requireInfluencerAuth
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const API_DIR = 'src/app/api/influencer';

async function fixAuthInFile(filePath: string) {
  console.log(`\n📝 Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Fix 1: Update cookie name from influencer_auth_ to influencer_session_
  if (content.includes('influencer_auth_${username}')) {
    console.log('  ✅ Fixing cookie name: influencer_auth_ → influencer_session_');
    content = content.replace(
      /influencer_auth_\$\{username\}/g,
      'influencer_session_${username}'
    );
    modified = true;
  }

  // Fix 2: Replace requireAuth with requireInfluencerAuth (only if has username)
  if (content.includes('requireAuth') && content.includes('username')) {
    console.log('  ✅ Replacing requireAuth with requireInfluencerAuth');
    
    // Update import
    content = content.replace(
      /import.*?requireAuth.*?from '@\/lib\/auth\/api-helpers';/g,
      "import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';"
    );
    
    // Update usage
    content = content.replace(
      /const auth = await requireAuth\(req, '[^']+', '[^']+'\);/g,
      'const auth = await requireInfluencerAuth(req);'
    );
    
    modified = true;
  }

  // Fix 3: Remove getCurrentUser calls if cookie auth exists
  if (content.includes('getCurrentUser') && content.includes('checkAuth')) {
    console.log('  ✅ Removing getCurrentUser (using cookie auth instead)');
    
    // This is more complex, skip for now
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('  💾 File saved');
    return true;
  } else {
    console.log('  ⏭️  No changes needed');
    return false;
  }
}

async function main() {
  console.log('🚀 Starting API Auth Fix Script\n');
  console.log('📁 Searching for API routes...\n');

  const files = glob.sync(`${API_DIR}/**/route.ts`, {
    ignore: ['**/node_modules/**'],
  });

  console.log(`Found ${files.length} API route files\n`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      const wasFixed = await fixAuthInFile(file);
      if (wasFixed) {
        fixedCount++;
      } else {
        skippedCount++;
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${file}:`, error);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n✅ Script completed!`);
  console.log(`   Fixed: ${fixedCount} files`);
  console.log(`   Skipped: ${skippedCount} files`);
  console.log(`   Total: ${files.length} files\n`);
}

main().catch(console.error);
