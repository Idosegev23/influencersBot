import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
async function main() {
  const { startPipeline } = await import('../src/lib/pipeline/start');
  const result = await startPipeline({
    accountId: '4214549f-813b-406b-8b71-6550268235bb',
    username: 'meuhedet',
    websiteUrl: 'https://www.meuhedet.co.il/',
    isDemo: true,
    archetype: 'service_provider',
    youtube: '@meuhedetv',
    tiktok: '@meuhedet',
    maxPages: 300,
  });
  console.log('RESULT:', JSON.stringify(result));
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
