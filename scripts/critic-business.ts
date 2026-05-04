/**
 * critic-business.ts
 * ============================================================
 * Business Logic, Performance, Data Integrity & Integrations Audit
 * Static-analysis only — no network calls, no .env loading.
 *
 * Run: npx tsx scripts/critic-business.ts
 * Output: JSON to stdout + Hebrew summary to stderr
 * Exit: always 0
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';

// ─── Types ───────────────────────────────────────────────────

export interface CriticResult {
  category: string;
  score: number;
  checks: Check[];
  summary: string;
}

interface Check {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  } catch {
    return '';
  }
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

/** Glob relative to root; returns rel paths */
function glob(pattern: string): string[] {
  return fg.sync(pattern, { cwd: ROOT, dot: false });
}

/** Get all API route files */
function allApiRoutes(): string[] {
  return glob('src/app/api/**/*.ts');
}

/** Read a route file content */
function routeContent(relPath: string): string {
  return readFile(relPath);
}

function check(
  id: string,
  name: string,
  status: 'pass' | 'fail' | 'warn',
  message: string,
  details?: string[]
): Check {
  return { id, name, status, message, ...(details?.length ? { details } : {}) };
}

// ─── 1. Performance Checks ───────────────────────────────────

function checkPerformance(): Check[] {
  const results: Check[] = [];
  const routes = allApiRoutes();

  // Heavy-work keywords that suggest a route needs a maxDuration
  const heavyKeywords = [
    'openai', 'gemini', 'anthropic', 'scrapeCreators', 'transcrib',
    'ingest', 'embed', 'persona', 'scan', 'process', 'parse',
  ];

  const missingMaxDuration: string[] = [];
  const hasMaxDuration: string[] = [];

  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    const hasMax = /export\s+const\s+maxDuration\s*=/.test(content);
    const isHeavy = heavyKeywords.some(kw => content.toLowerCase().includes(kw));
    if (isHeavy) {
      if (!hasMax) missingMaxDuration.push(r);
      else hasMaxDuration.push(r);
    }
  }

  results.push(
    missingMaxDuration.length === 0
      ? check('perf-max-duration', 'maxDuration on heavy routes', 'pass',
          `All heavy-work routes have maxDuration set (${hasMaxDuration.length} routes).`)
      : check('perf-max-duration', 'maxDuration on heavy routes', 'warn',
          `${missingMaxDuration.length} heavy-work route(s) missing maxDuration — risk of Vercel timeout.`,
          missingMaxDuration)
  );

  // N+1: await inside a for/forEach loop
  const n1Files: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    // Look for a for/while loop body that contains an await call
    if (/for\s*\(.*\)[\s\S]{0,300}await\s+/m.test(content) ||
        /while\s*\(.*\)[\s\S]{0,300}await\s+/m.test(content)) {
      n1Files.push(r);
    }
  }

  results.push(
    n1Files.length === 0
      ? check('perf-n1', 'No N+1 await-in-loop patterns', 'pass',
          'No obvious await-inside-loop patterns found in API routes.')
      : check('perf-n1', 'N+1 await-in-loop patterns', 'warn',
          `${n1Files.length} route(s) may have await inside loops (N+1 risk).`,
          n1Files)
  );

  // Heavy libs imported at top-level instead of dynamic import
  const heavyLibs = ['openai', '@anthropic-ai', '@google/generative-ai', 'puppeteer', 'playwright'];
  const topLevelHeavy: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    for (const lib of heavyLibs) {
      // Static import at file level (not inside function)
      const staticImport = new RegExp(`^import\\s+.*from\\s+['"]${lib.replace('/', '\\/')}`, 'm');
      if (staticImport.test(content)) {
        topLevelHeavy.push(`${r} (${lib})`);
        break;
      }
    }
  }

  results.push(
    topLevelHeavy.length === 0
      ? check('perf-dynamic-imports', 'Heavy libs use dynamic imports', 'pass',
          'No heavy AI libs detected as static top-level imports in API routes.')
      : check('perf-dynamic-imports', 'Heavy libs as static imports', 'warn',
          `${topLevelHeavy.length} route(s) import heavy libs at module level — consider dynamic imports.`,
          topLevelHeavy)
  );

  // Streaming routes use proper ReadableStream or StreamingTextResponse patterns
  const streamRoutes = routes.filter(r => r.includes('stream') || r.includes('webhook'));
  const badStreamRoutes: string[] = [];
  for (const r of streamRoutes) {
    const content = routeContent(r);
    if (!content) continue;
    const hasStream = /ReadableStream|StreamingTextResponse|new Response.*stream|TransformStream/.test(content);
    const hasLargeSync = /JSON\.stringify\([\s\S]{0,50}\)/.test(content) && !hasStream;
    if (!hasStream && !hasLargeSync) {
      // Not necessarily wrong but flag for review
      badStreamRoutes.push(r);
    }
  }
  // Only flag if a route named "stream" does not use streaming
  const nonStreamingStreamRoute = routes.filter(r => r.includes('/stream/') && !/ReadableStream|new Response.*stream|TransformStream|encoder/.test(routeContent(r)));
  results.push(
    nonStreamingStreamRoute.length === 0
      ? check('perf-streaming', 'Streaming routes use proper patterns', 'pass',
          'Stream-named routes appear to use streaming response patterns.')
      : check('perf-streaming', 'Stream routes missing streaming pattern', 'fail',
          `${nonStreamingStreamRoute.length} route(s) named "stream" do not appear to stream responses.`,
          nonStreamingStreamRoute)
  );

  // Next.js <Image> vs raw <img> in pages/components
  const pageFiles = glob('src/app/**/*.{tsx,jsx}');
  const rawImgFiles: string[] = [];
  for (const f of pageFiles) {
    const content = readFile(f);
    if (!content) continue;
    // Detect <img (not <Image) in JSX, ignore SVG elements
    if (/<img\s/.test(content) && !/from ['"]next\/image['"]/.test(content)) {
      rawImgFiles.push(f);
    }
  }
  results.push(
    rawImgFiles.length === 0
      ? check('perf-next-image', 'Next.js <Image> used (no raw <img>)', 'pass',
          'No raw <img> tags found in pages without next/image import.')
      : check('perf-next-image', 'Raw <img> tags found', 'warn',
          `${rawImgFiles.length} page/component file(s) use raw <img> tags instead of next/image.`,
          rawImgFiles.slice(0, 10))
  );

  return results;
}

// ─── 2. Integrations & Resilience ────────────────────────────

function checkIntegrations(): Check[] {
  const results: Check[] = [];
  const routes = allApiRoutes();

  // External API calls — look for fetch() without AbortSignal / signal option
  const fetchWithoutTimeout: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    // Has fetch calls
    if (/\bfetch\(/.test(content)) {
      // Doesn't have AbortController or signal: or timeout:
      if (!/AbortController|signal:|AbortSignal\.timeout/.test(content)) {
        fetchWithoutTimeout.push(r);
      }
    }
  }
  results.push(
    fetchWithoutTimeout.length === 0
      ? check('int-fetch-timeout', 'All fetch() calls have timeout/signal', 'pass',
          'All routes with fetch() appear to configure AbortController or signal.')
      : check('int-fetch-timeout', 'fetch() calls without timeout', 'warn',
          `${fetchWithoutTimeout.length} route(s) use fetch() without AbortController/signal — risk of hanging requests.`,
          fetchWithoutTimeout.slice(0, 10))
  );

  // Try/catch around external AI calls
  const aiCallKeywords = ['openai.', 'gemini', 'anthropic', 'scrapeCreators', 'ScrapeCreators'];
  const missingTryCatch: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    const hasAI = aiCallKeywords.some(kw => content.includes(kw));
    if (hasAI) {
      const hasTryCatch = /try\s*\{/.test(content);
      if (!hasTryCatch) missingTryCatch.push(r);
    }
  }
  results.push(
    missingTryCatch.length === 0
      ? check('int-try-catch', 'try/catch around AI calls', 'pass',
          'All routes using external AI APIs have try/catch blocks.')
      : check('int-try-catch', 'Missing try/catch around AI calls', 'fail',
          `${missingTryCatch.length} route(s) call AI APIs without try/catch.`,
          missingTryCatch)
  );

  // Multi-model fallback — check AI parser has fallback chain
  const parserFiles = glob('src/lib/ai-parser/**/*.ts');
  const hasFallback = parserFiles.some(f => {
    const c = readFile(f);
    return /fallback|catch.*gemini|catch.*claude|catch.*gpt|try.*gemini[\s\S]{0,500}try.*claude/i.test(c);
  });
  results.push(
    hasFallback
      ? check('int-ai-fallback', 'AI multi-model fallback chain exists', 'pass',
          'ai-parser lib appears to implement multi-model fallback.')
      : check('int-ai-fallback', 'AI multi-model fallback not detected', 'warn',
          'Could not detect multi-model fallback chain in src/lib/ai-parser/.')
  );

  // Webhook routes return 200 quickly (no await of heavy ops before response)
  const webhookRoutes = routes.filter(r => r.includes('/webhooks/'));
  const heavyWebhooks: string[] = [];
  for (const r of webhookRoutes) {
    const content = routeContent(r);
    if (!content) continue;
    // Flag if heavy async work happens BEFORE returning 200
    // Heuristic: no early return NextResponse.json({ok:true}) before the heavy work
    const earlyReturn = /return.*NextResponse.*200|return.*new Response.*200/.test(content);
    if (!earlyReturn) {
      heavyWebhooks.push(r);
    }
  }
  results.push(
    heavyWebhooks.length === 0
      ? check('int-webhook-fast', 'Webhooks return 200 quickly', 'pass',
          'Webhook routes appear to return a response promptly.')
      : check('int-webhook-fast', 'Webhooks may do heavy sync work', 'warn',
          `${heavyWebhooks.length} webhook route(s) may not return 200 immediately — risk of provider retries.`,
          heavyWebhooks)
  );

  // Cron routes all have CRON_SECRET auth check
  const cronRoutes = glob('src/app/api/cron/**/route.ts');
  const cronNoAuth: string[] = [];
  for (const r of cronRoutes) {
    const content = routeContent(r);
    if (!content) continue;
    if (!/CRON_SECRET/.test(content)) {
      cronNoAuth.push(r);
    }
  }
  results.push(
    cronNoAuth.length === 0
      ? check('int-cron-auth', 'All cron routes verify CRON_SECRET', 'pass',
          `All ${cronRoutes.length} cron route(s) check CRON_SECRET.`)
      : check('int-cron-auth', 'Cron routes missing CRON_SECRET check', 'fail',
          `${cronNoAuth.length} cron route(s) do not verify CRON_SECRET.`,
          cronNoAuth)
  );

  return results;
}

// ─── 3. Data Integrity ────────────────────────────────────────

function checkDataIntegrity(): Check[] {
  const results: Check[] = [];
  const routes = allApiRoutes();

  // Routes that INSERT/UPSERT should include account_id
  const writeRoutes = routes.filter(r => {
    const c = routeContent(r);
    return /\.insert\(|\.upsert\(/.test(c);
  });
  const missingAccountId: string[] = [];
  for (const r of writeRoutes) {
    const content = routeContent(r);
    // Skip admin/cron routes that intentionally operate cross-tenant
    if (r.includes('/admin/') || r.includes('/cron/') || r.includes('/webhook')) continue;
    if (!content.includes('account_id')) {
      missingAccountId.push(r);
    }
  }
  results.push(
    missingAccountId.length === 0
      ? check('data-account-id', 'Write routes include account_id', 'pass',
          'All non-admin write routes appear to scope by account_id.')
      : check('data-account-id', 'Write routes missing account_id', 'fail',
          `${missingAccountId.length} route(s) write to DB without account_id — multi-tenant isolation risk.`,
          missingAccountId)
  );

  // Upsert with onConflict
  const upsertRoutes: string[] = [];
  const upsertNoConflict: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    if (content.includes('.upsert(')) {
      upsertRoutes.push(r);
      if (!content.includes('onConflict')) {
        upsertNoConflict.push(r);
      }
    }
  }
  results.push(
    upsertNoConflict.length === 0
      ? check('data-upsert-conflict', 'Upserts specify onConflict', 'pass',
          `All ${upsertRoutes.length} upsert call(s) specify onConflict.`)
      : check('data-upsert-conflict', 'Upserts missing onConflict', 'warn',
          `${upsertNoConflict.length} upsert call(s) do not specify onConflict — risk of duplicate rows.`,
          upsertNoConflict)
  );

  // .single() without error handling
  const singleWithoutCheck: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    if (!content.includes('.single()')) continue;
    // Check if there's error handling after .single()
    // Simple heuristic: if .single() appears but "PGRST116" or null check not nearby
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('.single()')) {
        // Check next 10 lines for error handling
        const context = lines.slice(i, i + 10).join('\n');
        if (!/if.*error|error\?|catch|PGRST116/.test(context)) {
          singleWithoutCheck.push(`${r}:${i + 1}`);
        }
      }
    }
  }
  results.push(
    singleWithoutCheck.length === 0
      ? check('data-single-error', '.single() calls have error handling', 'pass',
          'All .single() calls appear to check for errors.')
      : check('data-single-error', '.single() calls missing error handling', 'warn',
          `${singleWithoutCheck.length} .single() call(s) may lack error handling — can throw on empty results.`,
          singleWithoutCheck.slice(0, 10))
  );

  // Supabase query errors not checked (.error ignored)
  const errorNotChecked: string[] = [];
  for (const r of routes) {
    const content = routeContent(r);
    if (!content) continue;
    // Look for const { data } = await supabase without destructuring error
    const matches = content.match(/const\s*\{\s*data\s*\}\s*=\s*await\s+supabase/g);
    if (matches && matches.length > 0) {
      errorNotChecked.push(`${r} (${matches.length} query/queries without error destructuring)`);
    }
  }
  results.push(
    errorNotChecked.length === 0
      ? check('data-supabase-error', 'Supabase errors always checked', 'pass',
          'No obvious cases of Supabase queries ignoring the error field.')
      : check('data-supabase-error', 'Supabase queries ignoring errors', 'warn',
          `${errorNotChecked.length} route(s) have queries that don't destructure the error field.`,
          errorNotChecked.slice(0, 10))
  );

  return results;
}

// ─── 4. Business Logic ────────────────────────────────────────

function checkBusinessLogic(): Check[] {
  const results: Check[] = [];

  // Chat routes have session management
  const chatStreamContent = readFile('src/app/api/chat/stream/route.ts');
  const hasSessionMgmt = chatStreamContent.includes('createChatSession') ||
    chatStreamContent.includes('session_id') ||
    chatStreamContent.includes('sessionId');
  results.push(
    hasSessionMgmt
      ? check('biz-chat-session', 'Chat stream has session management', 'pass',
          '/api/chat/stream/route.ts manages chat sessions.')
      : check('biz-chat-session', 'Chat stream missing session management', 'fail',
          '/api/chat/stream/route.ts does not appear to create/validate sessions.')
  );

  // Influencer routes validate ownership (not just auth)
  const influencerRoutes = glob('src/app/api/influencer/**/*.ts');
  const noOwnershipCheck: string[] = [];
  for (const r of influencerRoutes) {
    const content = routeContent(r);
    if (!content) continue;
    const hasAuth = /requireInfluencerAuth|influencer_session|auth\.accountId/.test(content);
    const hasOwnership = /auth\.accountId|accountId.*eq|\.eq.*account_id/.test(content);
    if (hasAuth && !hasOwnership) {
      noOwnershipCheck.push(r);
    }
  }
  results.push(
    noOwnershipCheck.length === 0
      ? check('biz-influencer-ownership', 'Influencer routes check ownership', 'pass',
          'Influencer routes appear to validate resource ownership via account_id.')
      : check('biz-influencer-ownership', 'Influencer routes missing ownership check', 'warn',
          `${noOwnershipCheck.length} influencer route(s) may not validate that the user owns the resource.`,
          noOwnershipCheck.slice(0, 10))
  );

  // Admin routes validate required fields
  const adminRoutes = glob('src/app/api/admin/**/*.ts');
  const adminNoValidation: string[] = [];
  for (const r of adminRoutes) {
    const content = routeContent(r);
    if (!content) continue;
    const hasPost = /export\s+async\s+function\s+POST/.test(content);
    if (!hasPost) continue;
    const hasValidation = /if\s*\(!|required|missing|validate|zod|z\./.test(content);
    if (!hasValidation) {
      adminNoValidation.push(r);
    }
  }
  results.push(
    adminNoValidation.length === 0
      ? check('biz-admin-validation', 'Admin routes validate required fields', 'pass',
          'All admin POST routes appear to validate input.')
      : check('biz-admin-validation', 'Admin routes missing field validation', 'warn',
          `${adminNoValidation.length} admin POST route(s) may not validate required fields.`,
          adminNoValidation.slice(0, 10))
  );

  // Coupon routes have validation
  const couponRoutes = glob('src/app/api/influencer/coupons/**/*.ts').concat(
    glob('src/app/api/admin/coupons/**/*.ts')
  );
  const couponIssues: string[] = [];
  for (const r of couponRoutes) {
    const content = routeContent(r);
    if (!content) continue;
    const hasPOST = /POST/.test(content);
    if (!hasPOST) continue;
    const hasValidation = /if\s*\(!|required|validate|code|discount/.test(content);
    if (!hasValidation) couponIssues.push(r);
  }
  results.push(
    couponIssues.length === 0
      ? check('biz-coupon-validation', 'Coupon routes have validation', 'pass',
          'Coupon POST routes appear to validate input fields.')
      : check('biz-coupon-validation', 'Coupon routes missing validation', 'warn',
          `${couponIssues.length} coupon route(s) may lack proper input validation.`,
          couponIssues)
  );

  // GDPR delete route actually deletes data
  const gdprContent = readFile('src/app/api/gdpr/delete-data/route.ts');
  const hasDeleteOps = gdprContent.includes('.delete()') && gdprContent.includes('session');
  const deletesMessages = gdprContent.includes('chat_messages');
  const deletesSessions = gdprContent.includes('chat_sessions');
  results.push(
    hasDeleteOps && deletesMessages && deletesSessions
      ? check('biz-gdpr-delete', 'GDPR delete route deletes data', 'pass',
          '/api/gdpr/delete-data deletes chat_messages and chat_sessions.')
      : check('biz-gdpr-delete', 'GDPR delete route incomplete', 'warn',
          '/api/gdpr/delete-data may not delete all required data.',
          [
            !hasDeleteOps ? 'No .delete() operations found' : '',
            !deletesMessages ? 'chat_messages not deleted' : '',
            !deletesSessions ? 'chat_sessions not deleted' : '',
          ].filter(Boolean))
  );

  return results;
}

// ─── 5. Cron Jobs Health ──────────────────────────────────────

function checkCronHealth(): Check[] {
  const results: Check[] = [];

  // Parse vercel.json cron paths
  const vercelJson = readFile('vercel.json');
  let cronPaths: string[] = [];
  try {
    const vercel = JSON.parse(vercelJson);
    cronPaths = (vercel.crons || []).map((c: { path: string }) => c.path as string);
  } catch {
    results.push(check('cron-vercel-json', 'vercel.json parse', 'fail',
      'Could not parse vercel.json to extract cron paths.'));
    return results;
  }

  // Check every cron path has a matching route file
  const orphanedCrons: string[] = [];
  const matchedCrons: string[] = [];
  for (const cronPath of cronPaths) {
    // /api/cron/daily-scan → src/app/api/cron/daily-scan/route.ts
    const filePath = `src/app${cronPath}/route.ts`;
    if (fileExists(filePath)) {
      matchedCrons.push(cronPath);
    } else {
      orphanedCrons.push(cronPath);
    }
  }
  results.push(
    orphanedCrons.length === 0
      ? check('cron-route-files', 'All vercel.json crons have route files', 'pass',
          `All ${cronPaths.length} cron path(s) have matching route.ts files.`)
      : check('cron-route-files', 'Orphaned cron entries in vercel.json', 'fail',
          `${orphanedCrons.length} cron path(s) in vercel.json have no matching route file.`,
          orphanedCrons)
  );

  // Check for cron route files NOT in vercel.json (unscheduled crons)
  const allCronDirs = fg.sync('src/app/api/cron/*/route.ts', { cwd: ROOT }).map(f => {
    const parts = f.split('/');
    const dirName = parts[parts.length - 2];
    return `/api/cron/${dirName}`;
  }).filter(p => p !== '/api/cron/route'); // skip the index route

  const unscheduledCrons = allCronDirs.filter(p => !cronPaths.includes(p));
  results.push(
    unscheduledCrons.length === 0
      ? check('cron-scheduled', 'All cron routes are scheduled in vercel.json', 'pass',
          'All cron route files have a corresponding vercel.json entry.')
      : check('cron-scheduled', 'Cron routes not in vercel.json', 'warn',
          `${unscheduledCrons.length} cron route(s) exist but are NOT scheduled in vercel.json.`,
          unscheduledCrons)
  );

  // Check cron routes have error handling
  const cronRouteFiles = glob('src/app/api/cron/**/route.ts');
  const cronNoErrorHandling: string[] = [];
  for (const r of cronRouteFiles) {
    const content = routeContent(r);
    if (!content) continue;
    if (!/try\s*\{/.test(content)) {
      cronNoErrorHandling.push(r);
    }
  }
  results.push(
    cronNoErrorHandling.length === 0
      ? check('cron-error-handling', 'Cron routes handle errors gracefully', 'pass',
          'All cron routes have try/catch error handling.')
      : check('cron-error-handling', 'Cron routes missing error handling', 'fail',
          `${cronNoErrorHandling.length} cron route(s) lack try/catch — a crash will fail silently.`,
          cronNoErrorHandling)
  );

  // Check cron routes have maxDuration
  const cronNoMaxDuration: string[] = [];
  for (const r of cronRouteFiles) {
    const content = routeContent(r);
    if (!content) continue;
    if (!/export\s+const\s+maxDuration\s*=/.test(content)) {
      cronNoMaxDuration.push(r);
    }
  }
  results.push(
    cronNoMaxDuration.length === 0
      ? check('cron-max-duration', 'Cron routes have maxDuration', 'pass',
          'All cron routes specify maxDuration.')
      : check('cron-max-duration', 'Cron routes missing maxDuration', 'warn',
          `${cronNoMaxDuration.length} cron route(s) do not set maxDuration — default Vercel timeout applies.`,
          cronNoMaxDuration)
  );

  return results;
}

// ─── 6. Environment Variables ─────────────────────────────────

function checkEnvVars(): Check[] {
  const results: Check[] = [];

  // Collect all process.env references in src/
  const allSrcFiles = glob('src/**/*.{ts,tsx}');
  const envRefs = new Map<string, string[]>();

  for (const f of allSrcFiles) {
    const content = readFile(f);
    if (!content) continue;
    const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]+)/g);
    for (const m of matches) {
      const envName = m[1];
      if (!envRefs.has(envName)) envRefs.set(envName, []);
      envRefs.get(envName)!.push(f);
    }
  }

  // Check client-side files for non-NEXT_PUBLIC_ vars
  const clientFiles = glob('src/app/**/*.{ts,tsx}').filter(f => !f.includes('/api/'));
  const serverEnvInClient: string[] = [];
  for (const f of clientFiles) {
    const content = readFile(f);
    if (!content) continue;
    const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]+)/g);
    for (const m of matches) {
      const envName = m[1];
      if (!envName.startsWith('NEXT_PUBLIC_')) {
        serverEnvInClient.push(`${f}: process.env.${envName}`);
      }
    }
  }
  results.push(
    serverEnvInClient.length === 0
      ? check('env-client-leak', 'No server env vars in client code', 'pass',
          'No non-NEXT_PUBLIC_ env vars detected in client-side code.')
      : check('env-client-leak', 'Server env vars used in client code', 'fail',
          `${serverEnvInClient.length} reference(s) to non-NEXT_PUBLIC_ vars in client components — will be undefined in browser.`,
          serverEnvInClient.slice(0, 10))
  );

  // Critical env vars should have fallbacks or early-exit checks
  const criticalVars = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY', 'CRON_SECRET', 'UPSTASH_REDIS_REST_URL',
  ];
  const noFallback: string[] = [];
  for (const varName of criticalVars) {
    const files = envRefs.get(varName) || [];
    const hasGuard = files.some(f => {
      const c = readFile(f);
      // Check if there's a guard like: if (!process.env.X) throw / return / process.exit
      return new RegExp(`if\\s*\\(!?\\s*process\\.env\\.${varName}|${varName}.*\\|\\|.*['"]`).test(c);
    });
    if (files.length > 0 && !hasGuard) {
      noFallback.push(varName);
    }
  }
  results.push(
    noFallback.length === 0
      ? check('env-critical-fallback', 'Critical env vars have guards/fallbacks', 'pass',
          'Critical environment variables have null checks or fallbacks.')
      : check('env-critical-fallback', 'Critical env vars without guards', 'warn',
          `${noFallback.length} critical env var(s) used without null checks: ${noFallback.join(', ')}.`,
          noFallback)
  );

  // Verify vercel.json cron paths match actual file structure
  const vercelJson = readFile('vercel.json');
  let vercelCronPaths: string[] = [];
  try {
    vercelCronPaths = JSON.parse(vercelJson).crons?.map((c: { path: string }) => c.path) || [];
  } catch { /* handled earlier */ }
  const mismatched = vercelCronPaths.filter(p => !fileExists(`src/app${p}/route.ts`));
  results.push(
    mismatched.length === 0
      ? check('env-vercel-paths', 'vercel.json paths match file structure', 'pass',
          'All vercel.json cron paths have corresponding route.ts files.')
      : check('env-vercel-paths', 'vercel.json paths mismatch', 'fail',
          `${mismatched.length} vercel.json cron path(s) do not have matching route files.`,
          mismatched)
  );

  return results;
}

// ─── 7. Feature Flags ─────────────────────────────────────────

function checkFeatureFlags(): Check[] {
  const results: Check[] = [];

  // Find all feature flag usages
  const flagPatterns = [
    /MEMORY_V2_ENABLED/,
    /USE_[A-Z_]+_ENGINE/,
    /features\.[a-z_]+/,
    /featureFlag/,
  ];

  const allSrcFiles = glob('src/**/*.ts');
  const flagFiles = new Map<string, string[]>();

  for (const f of allSrcFiles) {
    const content = readFile(f);
    if (!content) continue;
    for (const pattern of flagPatterns) {
      if (pattern.test(content)) {
        const key = pattern.source;
        if (!flagFiles.has(key)) flagFiles.set(key, []);
        flagFiles.get(key)!.push(f);
      }
    }
  }

  // Check MEMORY_V2_ENABLED has both on/off paths
  const memoryV2Files = flagFiles.get('MEMORY_V2_ENABLED') || [];
  const hasOnPath = memoryV2Files.some(f => {
    const c = readFile(f);
    return /MEMORY_V2_ENABLED.*===.*'true'|'true'.*===.*MEMORY_V2_ENABLED/.test(c);
  });
  const hasOffPath = memoryV2Files.some(f => {
    const c = readFile(f);
    return /else\s*\{|MEMORY_V2_ENABLED.*!==|!\s*memory|false/.test(c);
  });
  results.push(
    memoryV2Files.length === 0
      ? check('ff-memory-v2', 'MEMORY_V2_ENABLED flag', 'warn',
          'MEMORY_V2_ENABLED feature flag not found in src/.')
      : (hasOnPath
          ? check('ff-memory-v2', 'MEMORY_V2_ENABLED has on/off paths', 'pass',
              `MEMORY_V2_ENABLED used in ${memoryV2Files.length} file(s) with proper conditional paths.`)
          : check('ff-memory-v2', 'MEMORY_V2_ENABLED missing on path', 'warn',
              `MEMORY_V2_ENABLED found but on/off condition paths may be incomplete.`,
              memoryV2Files))
  );

  // Check per-account feature flags (features.X JSONB)
  const perAccountFlagFiles = flagFiles.get('features\\.[a-z_]+') || [];
  results.push(
    perAccountFlagFiles.length > 0
      ? check('ff-per-account', 'Per-account feature flags used', 'pass',
          `Per-account feature flags (accounts.features JSONB) found in ${perAccountFlagFiles.length} file(s).`)
      : check('ff-per-account', 'Per-account feature flags not found', 'warn',
          'No per-account feature flag usage (accounts.features) detected.')
  );

  // Check feature flag consistency: no hardcoded 'true' overrides
  const hardcodedOverrides: string[] = [];
  const flagCheckFiles = glob('src/**/*.ts');
  for (const f of flagCheckFiles) {
    const content = readFile(f);
    if (!content) continue;
    // Look for: SOME_FLAG = 'true' or SOME_FLAG = true (assignment, not comparison)
    if (/MEMORY_V2_ENABLED\s*=\s*['"]true['"]/.test(content)) {
      hardcodedOverrides.push(f);
    }
  }
  results.push(
    hardcodedOverrides.length === 0
      ? check('ff-no-hardcode', 'No hardcoded feature flag overrides', 'pass',
          'No hardcoded feature flag overrides detected.')
      : check('ff-no-hardcode', 'Hardcoded feature flag overrides found', 'fail',
          `${hardcodedOverrides.length} file(s) may hardcode feature flag values.`,
          hardcodedOverrides)
  );

  return results;
}

// ─── Score Calculation ────────────────────────────────────────

function calculateScore(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const total = checks.reduce((sum, c) => sum + weights[c.status], 0);
  return Math.round((total / checks.length) * 100);
}

// ─── Main ─────────────────────────────────────────────────────

function main() {
  const allChecks: Check[] = [
    ...checkPerformance(),
    ...checkIntegrations(),
    ...checkDataIntegrity(),
    ...checkBusinessLogic(),
    ...checkCronHealth(),
    ...checkEnvVars(),
    ...checkFeatureFlags(),
  ];

  const score = calculateScore(allChecks);

  const fails = allChecks.filter(c => c.status === 'fail');
  const warns = allChecks.filter(c => c.status === 'warn');
  const passes = allChecks.filter(c => c.status === 'pass');

  const result: CriticResult = {
    category: 'business',
    score,
    checks: allChecks,
    summary: `${passes.length} passed, ${warns.length} warnings, ${fails.length} failures — overall score: ${score}/100`,
  };

  // Print JSON to stdout
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  // Hebrew summary to stderr
  const hebrewLines = [
    '',
    '══════════════════════════════════════════════════',
    '   ביקורת עסקית — דוח סיכום',
    '══════════════════════════════════════════════════',
    `ציון כולל: ${score}/100`,
    `✅ עברו: ${passes.length}  ⚠️  אזהרות: ${warns.length}  ❌ נכשלו: ${fails.length}`,
    '',
  ];

  if (fails.length > 0) {
    hebrewLines.push('❌ כשלונות קריטיים:');
    for (const f of fails) {
      hebrewLines.push(`   • [${f.id}] ${f.name}: ${f.message}`);
    }
    hebrewLines.push('');
  }

  if (warns.length > 0) {
    hebrewLines.push('⚠️  אזהרות:');
    for (const w of warns) {
      hebrewLines.push(`   • [${w.id}] ${w.name}: ${w.message}`);
    }
    hebrewLines.push('');
  }

  hebrewLines.push('══════════════════════════════════════════════════');
  hebrewLines.push('');

  process.stderr.write(hebrewLines.join('\n'));
}

main();
