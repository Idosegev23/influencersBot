#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Full Account Setup Orchestrator
 *
 * Interactive CLI that runs the entire setup pipeline for a new account:
 *   1. Create account in DB (or use existing)
 *   2. Instagram scrape + content processing + RAG + persona
 *   3. Website scrape (optional)
 *   4. RAG enrichment
 *   5. Product extraction + enrichment (for websites)
 *   6. Persona rebuild with GPT-5.4
 *   7. Tab config generation
 *   8. Verification & smoke test
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/setup-account.ts
 *   npx tsx --tsconfig tsconfig.json scripts/setup-account.ts --username dekel --account-id abc-123
 *   npx tsx --tsconfig tsconfig.json scripts/setup-account.ts --resume abc-123
 *   npx tsx --tsconfig tsconfig.json scripts/setup-account.ts --resume abc-123 --from 4
 *   npx tsx --tsconfig tsconfig.json scripts/setup-account.ts --status abc-123
 *
 * Options:
 *   --username <name>       Instagram username
 *   --account-id <id>       Existing account ID (skip creation)
 *   --website <url>         Website URL for widget setup
 *   --resume <id>           Resume setup for existing account
 *   --from <step>           Start from specific step (1-8)
 *   --skip <steps>          Comma-separated steps to skip (e.g., "3,5")
 *   --status <id>           Show current setup status without running
 *   --dry-run               Show plan without executing
 *   --no-website            Skip website scrape even if URL exists
 *   --yes                   Skip confirmations
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// ─── Config ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── CLI helpers ───
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

// ─── Step definitions ───
interface StepDef {
  num: number;
  name: string;
  emoji: string;
  description: string;
  condition?: (ctx: SetupContext) => boolean;
}

const STEPS: StepDef[] = [
  { num: 1, name: 'create-account',       emoji: '📋', description: 'יצירת חשבון ב-DB' },
  { num: 2, name: 'instagram-scan',       emoji: '📡', description: 'סריקת אינסטגרם + עיבוד תוכן + RAG + פרסונה' },
  { num: 3, name: 'website-scrape',       emoji: '🌐', description: 'סריקת אתר (widget)', condition: ctx => !!ctx.websiteUrl },
  { num: 4, name: 'rag-enrichment',       emoji: '🧠', description: 'העשרת RAG — תרגום עברי + שאילתות סינתטיות' },
  { num: 5, name: 'product-extraction',   emoji: '🛍️', description: 'חילוץ והעשרת מוצרים', condition: ctx => !!ctx.websiteUrl },
  { num: 6, name: 'persona-rebuild',      emoji: '🎭', description: 'בניית פרסונה מחדש עם GPT-5.4' },
  { num: 7, name: 'tab-config',           emoji: '🏷️', description: 'יצירת הגדרות טאבים וצ\'אט' },
  { num: 8, name: 'verify',               emoji: '✅', description: 'אימות ובדיקת תקינות' },
];

// ─── Setup context ───
interface SetupContext {
  accountId: string;
  username: string;
  websiteUrl?: string;
  fromStep: number;
  skipSteps: number[];
  dryRun: boolean;
  autoConfirm: boolean;
  startTime: number;
  stepResults: Record<number, { status: 'done' | 'skipped' | 'failed'; duration?: number; details?: string }>;
}

// ─── Progress tracking (saved to DB) ───
async function saveProgress(ctx: SetupContext, step: number, status: string, details?: string) {
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ctx.accountId)
    .single();

  const currentConfig = account?.config || {};
  const setupProgress = currentConfig.setup_progress || {};
  setupProgress[`step_${step}`] = {
    status,
    details,
    timestamp: new Date().toISOString(),
  };
  setupProgress.last_step = step;
  setupProgress.last_status = status;

  await supabase
    .from('accounts')
    .update({ config: { ...currentConfig, setup_progress: setupProgress } })
    .eq('id', ctx.accountId);
}

async function loadProgress(accountId: string): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  return data?.config?.setup_progress || null;
}

// ══════════════════════════════════════════════════
// Step implementations
// ══════════════════════════════════════════════════

async function stepCreateAccount(ctx: SetupContext): Promise<void> {
  // Check if account exists
  const { data: existing } = await supabase
    .from('accounts')
    .select('id, config, type')
    .eq('id', ctx.accountId)
    .single();

  if (existing) {
    const name = (existing.config as any)?.username || existing.id;
    console.log(`   חשבון קיים: ${name} (${existing.type})`);
    if (existing.type !== 'creator') {
      console.log(`   ⚠️  סוג חשבון "${existing.type}" — מעדכן ל-"creator"`);
      await supabase.from('accounts').update({ type: 'creator' }).eq('id', ctx.accountId);
    }
    return;
  }

  // Create new account
  console.log(`   יוצר חשבון חדש: @${ctx.username}`);
  const { error } = await supabase.from('accounts').insert({
    id: ctx.accountId,
    type: 'creator',
    config: {
      username: ctx.username,
      display_name: ctx.username,
    },
  });

  if (error) throw new Error(`Failed to create account: ${error.message}`);
  console.log(`   ✅ חשבון נוצר: ${ctx.accountId}`);
}

async function stepInstagramScan(ctx: SetupContext): Promise<void> {
  console.log(`   מריץ סריקה מלאה ל-@${ctx.username}...`);
  console.log(`   (זה יכול לקחת 10-60 דקות)\n`);

  const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');
  const { DEFAULT_SCAN_CONFIG } = await import('../src/lib/scraping/newScanOrchestrator');

  const repo = getScanJobsRepo();
  const job = await repo.create({
    username: ctx.username,
    account_id: ctx.accountId,
    priority: 100,
    requested_by: 'script:setup-account',
    config: DEFAULT_SCAN_CONFIG,
  });
  console.log(`   Job ID: ${job.id}`);

  const { runScanJob } = await import('../src/lib/scraping/runScanJob');
  await runScanJob(job.id);
  console.log(`   ✅ סריקת אינסטגרם הושלמה`);

  // Content processing
  console.log(`\n   🔧 מעבד תוכן (תמלול + RAG + פרסונה)...`);
  const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
  const result = await processAccountContent({
    accountId: ctx.accountId,
    scanJobId: job.id,
    transcribeVideos: true,
    maxVideosToTranscribe: 999,
    buildRagIndex: true,
    buildPersona: true,
    priority: 'high',
  });

  console.log(`   ✅ עיבוד הושלם:`);
  console.log(`      סרטונים תומללו: ${result.stats.videosTranscribed}`);
  console.log(`      פרסונה נבנתה: ${result.stats.personaBuilt}`);
  console.log(`      מסמכי RAG: ${result.stats.ragDocumentsIngested}`);
  if (result.errors.length > 0) {
    console.log(`      ⚠️ שגיאות: ${result.errors.join(', ')}`);
  }
}

async function stepWebsiteScrape(ctx: SetupContext): Promise<void> {
  if (!ctx.websiteUrl) {
    console.log(`   דילוג — אין URL לאתר`);
    return;
  }

  console.log(`   סורק אתר: ${ctx.websiteUrl}`);
  console.log(`   (זה יכול לקחת 5-30 דקות)\n`);

  // Run deep-scrape-website.mjs as a child process
  const { execSync } = await import('child_process');
  const cmd = `node --env-file=.env.local scripts/deep-scrape-website.mjs ${ctx.websiteUrl} --account-id ${ctx.accountId}`;

  try {
    execSync(cmd, {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: 30 * 60 * 1000, // 30 min max
    });
    console.log(`   ✅ סריקת אתר הושלמה`);
  } catch (err: any) {
    throw new Error(`Website scrape failed: ${err.message}`);
  }
}

async function stepRagEnrichment(ctx: SetupContext): Promise<void> {
  console.log(`   מעשיר RAG chunks...`);

  const { enrichAccountChunks } = await import('../src/lib/rag/enrich');
  const result = await enrichAccountChunks(ctx.accountId, {
    dryRun: false,
    skipTranslation: false,
    skipSyntheticQueries: false,
    skipCleanup: false,
    skipPartnershipEnrich: false,
  });

  console.log(`   ✅ העשרה הושלמה:`);
  console.log(`      chunks שהועשרו: ${result.chunksEnriched}`);
  console.log(`      chunks זעירים נמחקו: ${result.chunksDeleted}`);
  console.log(`      תרגומים לעברית: ${result.translationsAdded}`);
  console.log(`      שאילתות סינתטיות: ${result.syntheticQueriesAdded}`);
  console.log(`      שותפויות מועשרות: ${result.partnershipsEnriched}`);
  if (result.errors.length > 0) {
    console.log(`      ⚠️ שגיאות: ${result.errors.join(', ')}`);
  }
}

async function stepProductExtraction(ctx: SetupContext): Promise<void> {
  if (!ctx.websiteUrl) {
    console.log(`   דילוג — אין אתר`);
    return;
  }

  console.log(`   מחלץ מוצרים מ-RAG chunks...`);

  const { execSync } = await import('child_process');

  // Extract
  try {
    execSync(
      `npx tsx --tsconfig tsconfig.json scripts/extract-products-from-rag.ts ${ctx.accountId}`,
      { cwd: process.cwd(), stdio: 'inherit', timeout: 10 * 60 * 1000 }
    );
  } catch (err: any) {
    console.log(`   ⚠️ חילוץ מוצרים נכשל: ${err.message}`);
    return;
  }

  // Enrich
  console.log(`\n   מעשיר מוצרים עם AI profiles...`);
  try {
    execSync(
      `npx tsx --tsconfig tsconfig.json scripts/enrich-products.ts ${ctx.accountId}`,
      { cwd: process.cwd(), stdio: 'inherit', timeout: 10 * 60 * 1000 }
    );
  } catch (err: any) {
    console.log(`   ⚠️ העשרת מוצרים נכשלה: ${err.message}`);
  }

  console.log(`   ✅ מוצרים חולצו והועשרו`);
}

async function stepPersonaRebuild(ctx: SetupContext): Promise<void> {
  console.log(`   בודק preprocessing_data...`);

  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('preprocessing_data, name, voice_rules, knowledge_map')
    .eq('account_id', ctx.accountId)
    .single();

  if (!persona?.preprocessing_data) {
    console.log(`   ⚠️ אין preprocessing_data — מדלג על rebuild (הפרסונה הראשונית מ-Step 2 תשמש)`);
    return;
  }

  console.log(`   בונה פרסונה מחדש עם GPT-5.4 עבור "${persona.name}"...`);

  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ctx.accountId)
    .single();

  const profileData = account?.config ? {
    username: (account.config as any).username,
    full_name: (account.config as any).display_name || (account.config as any).username,
    bio: (account.config as any).bio,
    followers_count: (account.config as any).followers_count,
    category: (account.config as any).category,
  } : undefined;

  const { buildPersonaWithGemini, savePersonaToDatabase } = await import('../src/lib/ai/gemini-persona-builder');

  const newPersona = await buildPersonaWithGemini(persona.preprocessing_data, profileData);

  console.log(`   זהות: ${newPersona.identity.who}`);
  console.log(`   טון: ${newPersona.voice.tone}`);
  console.log(`   נושאים: ${newPersona.knowledgeMap.coreTopics.length}`);
  console.log(`   מוצרים: ${newPersona.products?.length || 0}`);
  console.log(`   מותגים: ${newPersona.brands?.length || 0}`);
  console.log(`   קופונים: ${newPersona.coupons?.length || 0}`);

  await savePersonaToDatabase(
    supabase,
    ctx.accountId,
    newPersona,
    persona.preprocessing_data,
    JSON.stringify(newPersona)
  );

  console.log(`   ✅ פרסונה נבנתה מחדש בהצלחה`);
}

async function stepTabConfig(ctx: SetupContext): Promise<void> {
  console.log(`   מייצר הגדרות טאבים וצ'אט...`);

  const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
  const result = await generateTabConfig(ctx.accountId);

  console.log(`   טאבים: ${result.tabs.map((t: { label: string }) => t.label).join(' | ')}`);
  console.log(`   כותרת: ${result.chat_subtitle}`);
  console.log(`   ברכה: ${result.greeting_message}`);
  console.log(`   ✅ הגדרות צ'אט נשמרו`);
}

async function stepVerify(ctx: SetupContext): Promise<void> {
  console.log(`   מבצע בדיקות תקינות...\n`);

  let issues = 0;

  // Check persona
  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('name, voice_rules, knowledge_map, boundaries')
    .eq('account_id', ctx.accountId)
    .single();

  if (!persona) {
    console.log(`   ❌ פרסונה — לא קיימת!`);
    issues++;
  } else {
    if (!persona.name) { console.log(`   ❌ פרסונה — חסר name`); issues++; }
    else console.log(`   ✅ פרסונה: "${persona.name}"`);

    if (!persona.voice_rules) { console.log(`   ⚠️ פרסונה — חסר voice_rules`); issues++; }
    if (!persona.knowledge_map) { console.log(`   ⚠️ פרסונה — חסר knowledge_map`); issues++; }
  }

  // Check RAG chunks
  const { count: chunkCount } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId);

  if (!chunkCount || chunkCount === 0) {
    console.log(`   ❌ RAG — אין chunks!`);
    issues++;
  } else {
    console.log(`   ✅ RAG: ${chunkCount} chunks`);
  }

  // Check posts
  const { count: postCount } = await supabase
    .from('instagram_posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId);

  console.log(`   ${postCount ? '✅' : '⚠️'} פוסטים: ${postCount || 0}`);

  // Check transcriptions
  const { count: transcriptionCount } = await supabase
    .from('instagram_transcriptions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId);

  console.log(`   ${transcriptionCount ? '✅' : '⚠️'} תמלולים: ${transcriptionCount || 0}`);

  // Check tab config
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ctx.accountId)
    .single();

  const tabs = (account?.config as any)?.tabs;
  console.log(`   ${tabs ? '✅' : '⚠️'} טאבים: ${tabs ? tabs.length + ' tabs' : 'לא מוגדר'}`);

  // Check website products (if relevant)
  if (ctx.websiteUrl) {
    const { count: productCount } = await supabase
      .from('widget_products')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);

    console.log(`   ${productCount ? '✅' : '⚠️'} מוצרים: ${productCount || 0}`);
  }

  // Summary
  console.log();
  if (issues === 0) {
    console.log(`   🎉 הכל תקין! החשבון מוכן לשימוש.`);
    const chatUrl = `https://influencers-bot.vercel.app/chat/${ctx.username}`;
    console.log(`   🔗 צ'אט: ${chatUrl}`);
  } else {
    console.log(`   ⚠️ נמצאו ${issues} בעיות — ייתכן שנדרשת התערבות ידנית.`);
  }
}

// ─── Step runner map ───
const STEP_RUNNERS: Record<number, (ctx: SetupContext) => Promise<void>> = {
  1: stepCreateAccount,
  2: stepInstagramScan,
  3: stepWebsiteScrape,
  4: stepRagEnrichment,
  5: stepProductExtraction,
  6: stepPersonaRebuild,
  7: stepTabConfig,
  8: stepVerify,
};

// ══════════════════════════════════════════════════
// Main orchestrator
// ══════════════════════════════════════════════════

async function showStatus(accountId: string) {
  const progress = await loadProgress(accountId);
  const { data: account } = await supabase
    .from('accounts')
    .select('config, type')
    .eq('id', accountId)
    .single();

  if (!account) {
    console.log(`❌ חשבון ${accountId} לא נמצא`);
    return;
  }

  const username = (account.config as any)?.username || '?';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 סטטוס הקמה — @${username} (${accountId})`);
  console.log(`${'═'.repeat(60)}\n`);

  for (const step of STEPS) {
    const key = `step_${step.num}`;
    const data = progress?.[key];
    let status = '⬜ טרם הורץ';
    if (data?.status === 'done') status = `✅ הושלם (${data.timestamp})`;
    else if (data?.status === 'skipped') status = '⏭️ דולג';
    else if (data?.status === 'failed') status = `❌ נכשל: ${data.details || ''}`;
    else if (data?.status === 'running') status = '🔄 רץ...';

    console.log(`  ${step.emoji} שלב ${step.num}: ${step.description}`);
    console.log(`     ${status}`);
  }

  console.log();
}

async function main() {
  // ── Status mode ──
  const statusId = getArg('status');
  if (statusId) {
    await showStatus(statusId);
    process.exit(0);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 הקמת חשבון חדש — Influencer Bot`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── Gather params ──
  const resumeId = getArg('resume');
  let username = getArg('username') || '';
  let accountId = getArg('account-id') || resumeId || '';
  let websiteUrl = getArg('website') || '';
  const fromStep = parseInt(getArg('from') || '1', 10);
  const skipSteps = (getArg('skip') || '').split(',').filter(Boolean).map(Number);
  const dryRun = hasFlag('dry-run');
  const autoConfirm = hasFlag('yes');
  const noWebsite = hasFlag('no-website');

  // If resuming, load existing data
  if (resumeId) {
    const { data: account } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', resumeId)
      .single();

    if (!account) {
      console.log(`❌ חשבון ${resumeId} לא נמצא`);
      process.exit(1);
    }

    username = username || (account.config as any)?.username || '';
    websiteUrl = websiteUrl || (account.config as any)?.website_url || '';
    console.log(`📋 ממשיך הקמה עבור @${username} (${resumeId})`);

    const progress = await loadProgress(resumeId);
    if (progress?.last_step && fromStep === 1) {
      const suggestedStep = progress.last_status === 'done' ? progress.last_step + 1 : progress.last_step;
      console.log(`   שלב אחרון: ${progress.last_step} (${progress.last_status})`);
      console.log(`   מתחיל משלב ${suggestedStep}\n`);
    }
  }

  // Interactive prompts if needed
  if (!username) {
    username = await ask('📸 שם משתמש באינסטגרם: @');
    username = username.replace('@', '').trim();
  }

  if (!accountId) {
    // Check if account already exists by username
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .single();

    if (existing) {
      accountId = existing.id;
      console.log(`   נמצא חשבון קיים: ${accountId}`);
    } else {
      accountId = crypto.randomUUID();
      console.log(`   ID חדש: ${accountId}`);
    }
  }

  if (!websiteUrl && !noWebsite && !resumeId) {
    websiteUrl = await ask('🌐 URL אתר (אופציונלי, Enter לדלג): ');
    websiteUrl = websiteUrl.trim();
  }

  // ── Build context ──
  const ctx: SetupContext = {
    accountId,
    username,
    websiteUrl: noWebsite ? undefined : websiteUrl || undefined,
    fromStep,
    skipSteps,
    dryRun,
    autoConfirm,
    startTime: Date.now(),
    stepResults: {},
  };

  // ── Show plan ──
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 תוכנית הקמה:`);
  console.log(`   חשבון: @${ctx.username} (${ctx.accountId})`);
  if (ctx.websiteUrl) console.log(`   אתר: ${ctx.websiteUrl}`);
  console.log(`   שלבים:\n`);

  for (const step of STEPS) {
    const skip = ctx.skipSteps.includes(step.num) || step.num < ctx.fromStep;
    const conditionSkip = step.condition && !step.condition(ctx);
    const marker = skip ? '⏭️' : conditionSkip ? '➖' : '▶️';
    const note = skip ? ' (דילוג)' : conditionSkip ? ' (לא רלוונטי)' : '';
    console.log(`   ${marker} ${step.num}. ${step.emoji} ${step.description}${note}`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  if (dryRun) {
    console.log(`📋 DRY RUN — לא מבצע שינויים`);
    process.exit(0);
  }

  if (!autoConfirm) {
    const confirm = await ask('▶️  להתחיל? (y/n) ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('ביטול.');
      process.exit(0);
    }
  }

  // ── Execute steps ──
  for (const step of STEPS) {
    // Skip conditions
    if (step.num < ctx.fromStep) {
      ctx.stepResults[step.num] = { status: 'skipped', details: 'before fromStep' };
      continue;
    }
    if (ctx.skipSteps.includes(step.num)) {
      ctx.stepResults[step.num] = { status: 'skipped', details: 'user skip' };
      console.log(`⏭️  שלב ${step.num}: ${step.description} — דילוג\n`);
      await saveProgress(ctx, step.num, 'skipped');
      continue;
    }
    if (step.condition && !step.condition(ctx)) {
      ctx.stepResults[step.num] = { status: 'skipped', details: 'condition not met' };
      console.log(`➖ שלב ${step.num}: ${step.description} — לא רלוונטי\n`);
      await saveProgress(ctx, step.num, 'skipped', 'condition not met');
      continue;
    }

    // Run step
    console.log(`${'═'.repeat(60)}`);
    console.log(`${step.emoji} שלב ${step.num}/${STEPS.length}: ${step.description}`);
    console.log(`${'═'.repeat(60)}\n`);

    const stepStart = Date.now();
    await saveProgress(ctx, step.num, 'running');

    try {
      await STEP_RUNNERS[step.num](ctx);
      const duration = Date.now() - stepStart;
      ctx.stepResults[step.num] = { status: 'done', duration };
      await saveProgress(ctx, step.num, 'done', `${(duration / 1000).toFixed(1)}s`);
      console.log(`   ⏱️  ${(duration / 1000).toFixed(1)}s\n`);
    } catch (err: any) {
      const duration = Date.now() - stepStart;
      ctx.stepResults[step.num] = { status: 'failed', duration, details: err.message };
      await saveProgress(ctx, step.num, 'failed', err.message);

      console.log(`\n   ❌ שלב ${step.num} נכשל: ${err.message}`);
      console.log(`   ⏱️  ${(duration / 1000).toFixed(1)}s\n`);

      if (!autoConfirm) {
        const action = await ask('   מה לעשות? (c)ontinue / (r)etry / (q)uit: ');
        if (action === 'r') {
          // Retry same step
          console.log(`\n   🔄 מנסה שוב...\n`);
          try {
            await STEP_RUNNERS[step.num](ctx);
            ctx.stepResults[step.num] = { status: 'done', duration: Date.now() - stepStart };
            await saveProgress(ctx, step.num, 'done');
          } catch (retryErr: any) {
            console.log(`   ❌ ניסיון חוזר נכשל: ${retryErr.message}`);
            await saveProgress(ctx, step.num, 'failed', retryErr.message);
          }
        } else if (action === 'q') {
          console.log(`\n   לחזור אחר כך: npx tsx --tsconfig tsconfig.json scripts/setup-account.ts --resume ${ctx.accountId} --from ${step.num}`);
          process.exit(1);
        }
        // 'c' = continue to next step
      }
    }
  }

  // ── Final summary ──
  const totalTime = ((Date.now() - ctx.startTime) / 1000).toFixed(0);
  const totalMinutes = (parseInt(totalTime) / 60).toFixed(1);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏁 סיכום הקמה — @${ctx.username}`);
  console.log(`${'═'.repeat(60)}\n`);

  for (const step of STEPS) {
    const result = ctx.stepResults[step.num];
    if (!result) continue;
    const icon = result.status === 'done' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌';
    const time = result.duration ? ` (${(result.duration / 1000).toFixed(1)}s)` : '';
    console.log(`  ${icon} ${step.description}${time}`);
  }

  console.log(`\n  ⏱️  סה"כ: ${totalMinutes} דקות`);
  console.log(`  📋 לבדיקת סטטוס: npx tsx --tsconfig tsconfig.json scripts/setup-account.ts --status ${ctx.accountId}`);
  console.log(`  🔗 צ'אט: https://influencers-bot.vercel.app/chat/${ctx.username}`);
  console.log();

  rl.close();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
