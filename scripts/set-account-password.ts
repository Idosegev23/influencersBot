/**
 * Set (or reset) an account's owner login password. Stores a hash in
 * security_config.admin_password_hash (the auth route reads it there). The login
 * username is the account's config.username. Merges — never clobbers other
 * security_config keys.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/set-account-password.ts <accountId> <password>
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const [accountId, password] = process.argv.slice(2);
  if (!accountId || !password) { console.error('Usage: set-account-password.ts <accountId> <password>'); process.exit(1); }

  const { hashPassword } = await import('../src/lib/utils');
  const { createClient } = await import('../src/lib/supabase/server');
  const supabase = await createClient();

  const { data: acct, error } = await supabase.from('accounts').select('config, security_config').eq('id', accountId).single();
  if (error || !acct) { console.error('Account not found'); process.exit(1); }

  const hash = await hashPassword(password);
  const security_config = { ...(acct.security_config || {}), admin_password_hash: hash };
  const { error: upErr } = await supabase.from('accounts').update({ security_config }).eq('id', accountId);
  if (upErr) { console.error(upErr.message); process.exit(1); }

  console.log(`✅ password set for ${accountId}`);
  console.log(`   login username: ${(acct.config as any)?.username}`);
  console.log(`   password: ${password}`);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
