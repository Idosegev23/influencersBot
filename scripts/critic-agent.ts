/**
 * critic-agent.ts — Comprehensive code quality audit for influencerbot
 *
 * Run: npx tsx scripts/critic-agent.ts
 * Output: JSON to stdout + Hebrew summary to stderr
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Check {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string[];
}

export interface CriticResult {
  category: string;
  score: number;
  checks: Check[];
  summary: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');

function abs(rel: string): string {
  return path.join(ROOT, rel);
}

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function fileExists(rel: string): boolean {
  return fs.existsSync(abs(rel));
}

function getFiles(pattern: string): string[] {
  return fg.sync(pattern, { cwd: ROOT, absolute: true, ignore: ['**/node_modules/**', '**/.next/**'] });
}

function scoreFromChecks(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const passes = checks.filter(c => c.status === 'pass').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  const fails = checks.filter(c => c.status === 'fail').length;
  // pass=1pt, warn=0.5pt, fail=0pt
  return Math.round(((passes + warns * 0.5) / checks.length) * 100);
}

// ─── Check 1: TypeScript Compilation ─────────────────────────────────────────

function checkTypeScript(): Check[] {
  const check: Check = {
    id: 'ts-compile',
    name: 'TypeScript Compilation (tsc --noEmit)',
    status: 'pass',
    message: 'No TypeScript errors found',
    details: [],
  };

  try {
    execSync('npx tsc --noEmit 2>&1', {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    check.status = 'pass';
    check.message = 'TypeScript compilation passed with no errors';
  } catch (err: unknown) {
    const output = (err as { stdout?: Buffer; stderr?: Buffer }).stdout?.toString() ?? '';
    const lines = output.split('\n').filter(Boolean);
    const errorLines = lines.filter(l => l.includes('error TS'));
    if (errorLines.length === 0) {
      check.status = 'warn';
      check.message = 'tsc exited non-zero but no TS errors detected in output';
    } else {
      check.status = 'fail';
      check.message = `${errorLines.length} TypeScript error(s) found`;
      check.details = errorLines.slice(0, 20);
    }
  }

  return [check];
}

// ─── Check 2: Critical Files Exist ────────────────────────────────────────────

function checkCriticalFiles(): Check[] {
  const required = [
    'src/app/layout.tsx',
    'src/app/page.tsx',
    'middleware.ts',
    'next.config.ts',
    'tsconfig.json',
    'src/lib/supabase/server.ts',
    'src/lib/openai.ts',
    'src/lib/redis.ts',
    'src/lib/auth/admin-auth.ts',
    'src/lib/auth/influencer-auth.ts',
    'src/lib/sanitize.ts',
  ];

  const missing: string[] = [];
  const present: string[] = [];

  for (const f of required) {
    if (fileExists(f)) {
      present.push(f);
    } else {
      missing.push(f);
    }
  }

  const check: Check = {
    id: 'critical-files',
    name: 'Critical Files Exist',
    status: missing.length === 0 ? 'pass' : 'fail',
    message: missing.length === 0
      ? `All ${required.length} critical files present`
      : `${missing.length} critical file(s) missing`,
    details: missing.length > 0 ? missing : undefined,
  };

  return [check];
}

// ─── Check 3: API Routes Quality ─────────────────────────────────────────────

function checkApiRoutes(): Check[] {
  const routeFiles = getFiles('src/app/api/**/*.ts').filter(f => f.endsWith('route.ts'));

  const HTTP_METHODS = /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/;
  const ERROR_HANDLING = /try\s*\{|\.catch\s*\(|\.catch\(/;
  const ADMIN_ROUTE_PATTERN = /\/api\/admin\//;
  const ADMIN_AUTH_PATTERN = /requireAdminAuth|checkAdminAuth|admin_auth|ADMIN_COOKIE|bestieai_admin_session/;
  const INFLUENCER_ROUTE_PATTERN = /\/api\/influencer\//;
  const INFLUENCER_AUTH_PATTERN = /requireInfluencerAuth|influencer_auth|influencer.*auth/i;
  const CRON_ROUTE_PATTERN = /\/api\/cron\//;
  const CRON_SECRET_PATTERN = /CRON_SECRET|authorization.*cron|x-cron|Bearer.*cron/i;

  const noHttpMethod: string[] = [];
  const noErrorHandling: string[] = [];
  const adminWithoutAuth: string[] = [];
  const influencerWithoutAuth: string[] = [];
  const cronWithoutSecret: string[] = [];

  for (const file of routeFiles) {
    const content = readFile(file);
    const relPath = path.relative(ROOT, file);

    if (!HTTP_METHODS.test(content)) {
      noHttpMethod.push(relPath);
    }
    if (!ERROR_HANDLING.test(content)) {
      noErrorHandling.push(relPath);
    }
    if (ADMIN_ROUTE_PATTERN.test(relPath) && !ADMIN_AUTH_PATTERN.test(content)) {
      adminWithoutAuth.push(relPath);
    }
    if (INFLUENCER_ROUTE_PATTERN.test(relPath) && !INFLUENCER_AUTH_PATTERN.test(content)) {
      influencerWithoutAuth.push(relPath);
    }
    if (CRON_ROUTE_PATTERN.test(relPath) && !CRON_SECRET_PATTERN.test(content)) {
      cronWithoutSecret.push(relPath);
    }
  }

  const checks: Check[] = [];

  checks.push({
    id: 'api-http-methods',
    name: 'API Routes Export HTTP Methods',
    status: noHttpMethod.length === 0 ? 'pass' : 'fail',
    message: noHttpMethod.length === 0
      ? `All ${routeFiles.length} route files export HTTP methods`
      : `${noHttpMethod.length} route(s) missing HTTP method export`,
    details: noHttpMethod.length > 0 ? noHttpMethod : undefined,
  });

  checks.push({
    id: 'api-error-handling',
    name: 'API Routes Have Error Handling',
    status: noErrorHandling.length === 0 ? 'pass' : 'warn',
    message: noErrorHandling.length === 0
      ? 'All routes have try/catch or .catch()'
      : `${noErrorHandling.length} route(s) may lack error handling`,
    details: noErrorHandling.length > 0 ? noErrorHandling : undefined,
  });

  checks.push({
    id: 'api-admin-auth',
    name: 'Admin Routes Use Admin Auth',
    status: adminWithoutAuth.length === 0 ? 'pass' : 'fail',
    message: adminWithoutAuth.length === 0
      ? 'All admin routes have auth checks'
      : `${adminWithoutAuth.length} admin route(s) missing auth`,
    details: adminWithoutAuth.length > 0 ? adminWithoutAuth : undefined,
  });

  checks.push({
    id: 'api-influencer-auth',
    name: 'Influencer Routes Use Influencer Auth',
    status: influencerWithoutAuth.length === 0 ? 'pass' : 'warn',
    message: influencerWithoutAuth.length === 0
      ? 'All influencer routes have auth checks'
      : `${influencerWithoutAuth.length} influencer route(s) may be missing auth`,
    details: influencerWithoutAuth.length > 0 ? influencerWithoutAuth : undefined,
  });

  checks.push({
    id: 'api-cron-auth',
    name: 'Cron Routes Check CRON_SECRET',
    status: cronWithoutSecret.length === 0 ? 'pass' : 'fail',
    message: cronWithoutSecret.length === 0
      ? 'All cron routes check for CRON_SECRET'
      : `${cronWithoutSecret.length} cron route(s) missing secret check`,
    details: cronWithoutSecret.length > 0 ? cronWithoutSecret : undefined,
  });

  return checks;
}

// ─── Check 4: No Secrets in Client Code ──────────────────────────────────────

function checkNoSecretsInClient(): Check[] {
  const clientFiles = [
    ...getFiles('src/app/**/*.tsx'),
    ...getFiles('src/components/**/*.tsx'),
  ];

  const dangerousPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /process\.env\.SUPABASE_SERVICE_ROLE_KEY/, label: 'SUPABASE_SERVICE_ROLE_KEY' },
    { pattern: /process\.env\.OPENAI_API_KEY/, label: 'OPENAI_API_KEY' },
    { pattern: /process\.env\.ADMIN_PASSWORD/, label: 'ADMIN_PASSWORD' },
    { pattern: /['"`]sk-[A-Za-z0-9]{20,}/, label: 'OpenAI sk- key literal' },
    { pattern: /['"`]eyJ[A-Za-z0-9_-]{30,}/, label: 'JWT literal' },
    // Warn on non-public env vars that are not server-only
    { pattern: /process\.env\.[A-Z_]+(?<!NEXT_PUBLIC_[A-Z_]+)/, label: 'Non-NEXT_PUBLIC_ env var in client code' },
  ];

  const violations: string[] = [];

  for (const file of clientFiles) {
    const content = readFile(file);
    const relPath = path.relative(ROOT, file);

    // Skip server components (they can have 'use server' or be in api/)
    if (content.includes("'use server'") || content.includes('"use server"')) continue;
    // Skip files in api directory that accidentally match tsx glob
    if (relPath.includes('/api/')) continue;

    for (const { pattern, label } of dangerousPatterns) {
      if (pattern.test(content)) {
        // Skip if it's a NEXT_PUBLIC_ var (safe for client)
        const matches = content.match(new RegExp(pattern.source, 'g')) ?? [];
        const nonPublic = matches.filter(m => !m.includes('NEXT_PUBLIC_'));
        if (nonPublic.length > 0) {
          violations.push(`${relPath}: ${label}`);
        }
      }
    }
  }

  // De-dup
  const unique = [...new Set(violations)];

  return [{
    id: 'no-secrets-client',
    name: 'No Secrets in Client Code',
    status: unique.length === 0 ? 'pass' : 'fail',
    message: unique.length === 0
      ? 'No secrets or server-only env vars found in client code'
      : `${unique.length} potential secret exposure(s) in client code`,
    details: unique.length > 0 ? unique.slice(0, 30) : undefined,
  }];
}

// ─── Check 5: Error Handling Quality ─────────────────────────────────────────

function checkErrorHandlingQuality(): Check[] {
  const routeFiles = getFiles('src/app/api/**/*.ts').filter(f => f.endsWith('route.ts'));

  const emptyCatch: string[] = [];
  const noStatusCodes: string[] = [];

  // Detect truly empty catch blocks: catch (e) {} or catch(e){} or catch(_) {}
  const EMPTY_CATCH = /catch\s*\([^)]*\)\s*\{\s*\}/;
  // Detect at least one non-200 status code usage
  const STATUS_CODE_PATTERN = /status\s*:\s*[45]\d\d|NextResponse\.json\([^)]+,\s*\{\s*status\s*:/;

  for (const file of routeFiles) {
    const content = readFile(file);
    const relPath = path.relative(ROOT, file);

    if (EMPTY_CATCH.test(content)) {
      emptyCatch.push(relPath);
    }
    if (!STATUS_CODE_PATTERN.test(content)) {
      noStatusCodes.push(relPath);
    }
  }

  return [
    {
      id: 'no-empty-catch',
      name: 'No Empty Catch Blocks in API Routes',
      status: emptyCatch.length === 0 ? 'pass' : 'fail',
      message: emptyCatch.length === 0
        ? 'No empty catch blocks found'
        : `${emptyCatch.length} route(s) with empty catch blocks`,
      details: emptyCatch.length > 0 ? emptyCatch : undefined,
    },
    {
      id: 'proper-status-codes',
      name: 'API Routes Return Proper Error Status Codes',
      status: noStatusCodes.length === 0 ? 'pass' : 'warn',
      message: noStatusCodes.length === 0
        ? 'All routes use non-200 status codes for errors'
        : `${noStatusCodes.length} route(s) may not return 4xx/5xx status codes`,
      details: noStatusCodes.length > 0 ? noStatusCodes.slice(0, 20) : undefined,
    },
  ];
}

// ─── Check 6: Import Consistency ─────────────────────────────────────────────

function checkImportConsistency(): Check[] {
  const sourceFiles = [
    ...getFiles('src/**/*.ts'),
    ...getFiles('src/**/*.tsx'),
  ];

  const relativeDeepImports: string[] = [];
  // Match imports with 2+ levels of ../ (i.e., ../../ or deeper)
  const DEEP_RELATIVE = /from\s+['"](\.\.\/)(\.\.\/)([^'"]+)['"]/;

  for (const file of sourceFiles) {
    const content = readFile(file);
    const relPath = path.relative(ROOT, file);

    if (DEEP_RELATIVE.test(content)) {
      const matches = content.match(new RegExp(DEEP_RELATIVE.source, 'g')) ?? [];
      relativeDeepImports.push(`${relPath}: ${matches.slice(0, 3).join(', ')}`);
    }
  }

  return [{
    id: 'import-alias',
    name: 'Imports Use @/ Path Alias (not deep relative)',
    status: relativeDeepImports.length === 0 ? 'pass' : 'warn',
    message: relativeDeepImports.length === 0
      ? 'All imports use @/ alias or single-level relative paths'
      : `${relativeDeepImports.length} file(s) use deep relative imports (../../)`,
    details: relativeDeepImports.length > 0 ? relativeDeepImports.slice(0, 20) : undefined,
  }];
}

// ─── Check 7: Console.log Audit ──────────────────────────────────────────────

function checkConsoleLogs(): Check[] {
  const sourceFiles = [
    ...getFiles('src/**/*.ts'),
    ...getFiles('src/**/*.tsx'),
  ];
  // Exclude test files
  const prodFiles = sourceFiles.filter(f =>
    !f.includes('.test.') &&
    !f.includes('.spec.') &&
    !f.includes('__tests__') &&
    !f.includes('/tests/') &&
    !f.includes('/scripts/')
  );

  let totalCount = 0;
  const filesCounts: Array<{ file: string; count: number }> = [];

  for (const file of prodFiles) {
    const content = readFile(file);
    const matches = content.match(/console\.log\s*\(/g);
    if (matches && matches.length > 0) {
      totalCount += matches.length;
      filesCounts.push({ file: path.relative(ROOT, file), count: matches.length });
    }
  }

  filesCounts.sort((a, b) => b.count - a.count);
  const topFiles = filesCounts.slice(0, 10).map(f => `${f.file} (${f.count}x)`);

  let status: 'pass' | 'warn' | 'fail';
  let message: string;

  if (totalCount > 200) {
    status = 'fail';
    message = `${totalCount} console.log calls in production code (> 200 threshold)`;
  } else if (totalCount > 50) {
    status = 'warn';
    message = `${totalCount} console.log calls in production code (> 50 threshold)`;
  } else {
    status = 'pass';
    message = `${totalCount} console.log calls in production code (within acceptable range)`;
  }

  return [{
    id: 'console-logs',
    name: 'Console.log Audit',
    status,
    message,
    details: topFiles.length > 0 ? [`Top files: `, ...topFiles] : undefined,
  }];
}

// ─── Check 8: Dead Code Detection ────────────────────────────────────────────

function checkDeadCode(): Check[] {
  const sourceFiles = [
    ...getFiles('src/**/*.ts'),
    ...getFiles('src/**/*.tsx'),
  ];

  // Build a map of all exported functions/constants
  const EXPORT_PATTERN = /export\s+(async\s+)?(?:function|const|class)\s+(\w+)/g;

  const allExports: Array<{ name: string; file: string }> = [];
  const allContents: Map<string, string> = new Map();

  for (const file of sourceFiles) {
    const content = readFile(file);
    allContents.set(file, content);
    let m: RegExpExecArray | null;
    while ((m = EXPORT_PATTERN.exec(content)) !== null) {
      allExports.push({ name: m[2], file: path.relative(ROOT, file) });
    }
  }

  // For each exported name, check if it's imported anywhere
  const deadExports: string[] = [];
  const commonNames = new Set([
    'default', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
    'metadata', 'config', 'dynamic', 'revalidate', 'generateMetadata',
    'generateStaticParams', 'loader', 'action',
  ]);

  for (const { name, file } of allExports) {
    if (commonNames.has(name)) continue;
    // Check if this name is imported anywhere else
    const importPattern = new RegExp(`\\b${name}\\b`);
    let foundElsewhere = false;
    for (const [otherFile, content] of allContents) {
      const otherRel = path.relative(ROOT, otherFile);
      if (otherRel === file) continue;
      if (importPattern.test(content)) {
        foundElsewhere = true;
        break;
      }
    }
    if (!foundElsewhere) {
      deadExports.push(`${file}: ${name}`);
    }
  }

  const status = deadExports.length === 0 ? 'pass'
    : deadExports.length > 30 ? 'warn'
    : 'warn';

  return [{
    id: 'dead-code',
    name: 'Dead Code Detection (Unexported/Unreferenced Exports)',
    status,
    message: deadExports.length === 0
      ? 'No obviously dead exports detected'
      : `${deadExports.length} exported symbol(s) not found referenced elsewhere`,
    details: deadExports.length > 0 ? deadExports.slice(0, 20) : undefined,
  }];
}

// ─── Aggregation & Output ─────────────────────────────────────────────────────

function buildResult(category: string, checks: Check[]): CriticResult {
  const score = scoreFromChecks(checks);
  const passes = checks.filter(c => c.status === 'pass').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  const fails = checks.filter(c => c.status === 'fail').length;
  return {
    category,
    score,
    checks,
    summary: `${passes} passed, ${warns} warnings, ${fails} failed — score: ${score}/100`,
  };
}

async function main() {
  process.stderr.write('🔍 מריץ ביקורת קוד מקיפה...\n\n');

  const results: CriticResult[] = [];

  // 1. TypeScript
  process.stderr.write('  ✦ בודק TypeScript compilation...\n');
  results.push(buildResult('TypeScript', checkTypeScript()));

  // 2. Critical files
  process.stderr.write('  ✦ בודק קבצים קריטיים...\n');
  results.push(buildResult('Critical Files', checkCriticalFiles()));

  // 3. API Routes
  process.stderr.write('  ✦ סורק API routes...\n');
  results.push(buildResult('API Routes Quality', checkApiRoutes()));

  // 4. Secrets
  process.stderr.write('  ✦ בודק סודות בקוד client...\n');
  results.push(buildResult('Security (No Secrets in Client)', checkNoSecretsInClient()));

  // 5. Error handling quality
  process.stderr.write('  ✦ בודק איכות error handling...\n');
  results.push(buildResult('Error Handling Quality', checkErrorHandlingQuality()));

  // 6. Import consistency
  process.stderr.write('  ✦ בודק עקביות imports...\n');
  results.push(buildResult('Import Consistency', checkImportConsistency()));

  // 7. Console logs
  process.stderr.write('  ✦ סופר console.log calls...\n');
  results.push(buildResult('Console.log Audit', checkConsoleLogs()));

  // 8. Dead code
  process.stderr.write('  ✦ מחפש dead code...\n');
  results.push(buildResult('Dead Code Detection', checkDeadCode()));

  // Print JSON to stdout
  console.log(JSON.stringify(results, null, 2));

  // Print Hebrew summary to stderr
  const totalScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const allChecks = results.flatMap(r => r.checks);
  const totalPass = allChecks.filter(c => c.status === 'pass').length;
  const totalWarn = allChecks.filter(c => c.status === 'warn').length;
  const totalFail = allChecks.filter(c => c.status === 'fail').length;

  process.stderr.write('\n══════════════════════════════════════════\n');
  process.stderr.write('📊 סיכום ביקורת קוד — Influencerbot\n');
  process.stderr.write('══════════════════════════════════════════\n\n');

  for (const result of results) {
    const icon = result.score >= 80 ? '✅' : result.score >= 50 ? '⚠️' : '❌';
    process.stderr.write(`${icon} ${result.category}: ${result.score}/100\n`);
    for (const check of result.checks) {
      const cIcon = check.status === 'pass' ? '  ✓' : check.status === 'warn' ? '  ⚠' : '  ✗';
      process.stderr.write(`${cIcon} [${check.id}] ${check.message}\n`);
    }
    process.stderr.write('\n');
  }

  process.stderr.write(`\n🏁 ציון כולל: ${totalScore}/100\n`);
  process.stderr.write(`   עברו: ${totalPass} | אזהרות: ${totalWarn} | נכשלו: ${totalFail}\n\n`);

  if (totalFail > 0) {
    process.stderr.write(`⚠️  נמצאו ${totalFail} כשלון(ים) — מומלץ לטפל לפני deploy\n`);
  } else if (totalWarn > 0) {
    process.stderr.write(`ℹ️  נמצאו ${totalWarn} אזהרה(ות) — כדאי לבדוק\n`);
  } else {
    process.stderr.write('🎉 הכל תקין! הקוד עובר את כל הבדיקות\n');
  }

  // Always exit 0 so orchestrator can read JSON
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err}\n`);
  // Still output empty JSON so orchestrator doesn't break
  console.log(JSON.stringify([]));
  process.exit(0);
});
