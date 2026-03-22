#!/usr/bin/env node
/**
 * Download Instagram profile pictures → upload to Supabase Storage → save URL in accounts.config
 *
 * This ensures profile pics are stored permanently and don't break when Instagram CDN links expire.
 *
 * Usage:
 *   node --env-file=.env scripts/download-profile-pics.mjs
 *   node --env-file=.env scripts/download-profile-pics.mjs --account-id <id>   # single account
 *   node --env-file=.env scripts/download-profile-pics.mjs --force              # re-download even if already stored
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'avatars';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse CLI args
const args = process.argv.slice(2);
const force = args.includes('--force');
const accountIdIdx = args.indexOf('--account-id');
const singleAccountId = accountIdIdx !== -1 ? args[accountIdIdx + 1] : null;

async function getLatestProfilePics() {
  // Get the most recent profile pic per account
  const { data, error } = await supabase
    .from('instagram_profile_history')
    .select('account_id, profile_pic_url, snapshot_date')
    .order('snapshot_date', { ascending: false });

  if (error) throw new Error(`Failed to query profile pics: ${error.message}`);

  // Deduplicate — keep latest per account
  const byAccount = new Map();
  for (const row of data || []) {
    if (!byAccount.has(row.account_id) && row.profile_pic_url) {
      byAccount.set(row.account_id, row.profile_pic_url);
    }
  }
  return byAccount;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

async function uploadToStorage(accountId, buffer, contentType) {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${accountId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Get public URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function updateAccountConfig(accountId, profilePicUrl) {
  // Read current config
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  const config = account?.config || {};
  config.profile_pic_url = profilePicUrl;

  const { error } = await supabase
    .from('accounts')
    .update({ config })
    .eq('id', accountId);

  if (error) throw new Error(`Config update failed: ${error.message}`);
}

async function main() {
  console.log('📸 Downloading and storing profile pictures...\n');

  // Get accounts to process
  let query = supabase.from('accounts').select('id, config').eq('status', 'active');
  if (singleAccountId) {
    query = query.eq('id', singleAccountId);
  }
  const { data: accounts } = await query;

  if (!accounts?.length) {
    console.log('No accounts found.');
    return;
  }

  // Get latest Instagram profile pics
  const profilePics = await getLatestProfilePics();

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const account of accounts) {
    const name = account.config?.display_name || account.config?.username || account.id;
    const existingPic = account.config?.profile_pic_url;

    // Skip if already has a stored pic (unless --force)
    if (existingPic && !force) {
      console.log(`⏭  ${name} — already has stored pic`);
      skipped++;
      continue;
    }

    const instagramUrl = profilePics.get(account.id);
    if (!instagramUrl) {
      console.log(`⚠  ${name} — no Instagram profile pic found`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`📥 ${name} — downloading...`);
      const { buffer, contentType } = await downloadImage(instagramUrl);
      process.stdout.write(' uploading...');
      const publicUrl = await uploadToStorage(account.id, buffer, contentType);
      await updateAccountConfig(account.id, publicUrl);
      console.log(` ✅ ${publicUrl}`);
      downloaded++;
    } catch (err) {
      console.log(` ❌ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
