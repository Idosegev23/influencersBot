/**
 * One-off: send the demo-ready WhatsApp notification to a number.
 * Goes through sendDemoReady (lib) — with accountId it tries demo_ready_v2
 * (chat + widget-demo buttons) and falls back to demo_ready_v1 automatically.
 *
 * Requires WHATSAPP_NOTIFY_ENABLED=true in env (lib master flag).
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/send-wa-demo-ready.ts <to> <brandName> <username> [accountId]
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const [to, brandName, username, accountId] = process.argv.slice(2);
  if (!to || !brandName || !username) {
    console.error('Usage: send-wa-demo-ready.ts <to> <brandName> <username> [accountId]');
    process.exit(1);
  }
  const { sendDemoReady } = await import('../src/lib/whatsapp-notify');
  const res = await sendDemoReady({ to, brandName, accountUsername: username, accountId });
  console.log('RESULT:', JSON.stringify(res));
  if (!res.success) process.exit(1);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
