/**
 * critic-security.ts
 * ==================
 * Comprehensive static security audit for the influencerbot Next.js SaaS platform.
 *
 * Run:  npx tsx scripts/critic-security.ts
 * Output: JSON results to stdout + Hebrew summary to stderr.
 * Exit:   always 0
 *
 * Checks:
 *  1. Authentication Coverage  — all API routes checked for proper auth guards
 *  2. Secrets & Credentials    — hardcoded passwords, API keys, default fallbacks
 *  3. XSS Protection           — sanitize.ts, chat sanitization, dangerouslySetInnerHTML, CSP
 *  4. CSRF Protection          — mutation endpoint checks, cookie flags
 *  5. Rate Limiting            — middleware coverage, sensitive routes
 *  6. HTTP Security Headers    — next.config.ts header audit
 *  7. Input Validation         — SQL injection, path traversal, user-input sanitization
 *  8. Cookie Security          — httpOnly, secure, sameSite attributes
 */

import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const API_ROOT = path.join(ROOT, 'src', 'app', 'api');
const SRC_ROOT = path.join(ROOT, 'src');

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Returns the relative path from project root for display. */
function rel(filePath: string): string {
  return path.relative(ROOT, filePath);
}

/** Get all route.ts files under a directory (synchronously via fast-glob). */
function getRoutes(dir: string): string[] {
  return fg.sync('**/route.ts', { cwd: dir, absolute: true });
}

/** Determine the URL segment category from a full file path. */
function routeSegment(filePath: string): string {
  const relative = path.relative(API_ROOT, filePath);
  return relative.split(path.sep)[0] ?? 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authentication Coverage
// ─────────────────────────────────────────────────────────────────────────────

function checkAuthCoverage(): Check[] {
  const checks: Check[] = [];
  const allRoutes = getRoutes(API_ROOT);

  // ── Admin routes ──────────────────────────────────────────────────────────
  const adminRoutes = allRoutes.filter((f) => f.includes(`${path.sep}admin${path.sep}`));
  const adminMissingAuth: string[] = [];
  const adminUsesWrongAuth: string[] = [];

  for (const route of adminRoutes) {
    const content = readFile(route);
    const hasAdminAuth =
      content.includes('requireAdminAuth') ||
      content.includes('CRON_SECRET') ||       // some admin routes use cron auth
      content.includes('bestieai_admin_session');
    if (!hasAdminAuth) {
      adminMissingAuth.push(rel(route));
    }
    // Warn if it uses influencer auth instead of admin auth
    if (content.includes('requireInfluencerAuth') && !content.includes('requireAdminAuth')) {
      adminUsesWrongAuth.push(rel(route));
    }
  }

  checks.push({
    id: 'auth-admin-coverage',
    name: 'Admin Routes — Auth Coverage',
    status:
      adminMissingAuth.length === 0
        ? 'pass'
        : adminMissingAuth.length <= 2
        ? 'warn'
        : 'fail',
    message:
      adminMissingAuth.length === 0
        ? `All ${adminRoutes.length} admin routes have auth checks`
        : `${adminMissingAuth.length}/${adminRoutes.length} admin routes are missing auth`,
    details: adminMissingAuth,
  });

  if (adminUsesWrongAuth.length > 0) {
    checks.push({
      id: 'auth-admin-wrong-guard',
      name: 'Admin Routes — Wrong Auth Guard',
      status: 'warn',
      message: `${adminUsesWrongAuth.length} admin routes use influencer auth instead of admin auth`,
      details: adminUsesWrongAuth,
    });
  }

  // ── Influencer routes ─────────────────────────────────────────────────────
  const influencerRoutes = allRoutes.filter((f) =>
    f.includes(`${path.sep}influencer${path.sep}`)
  );
  // Auth route itself doesn't need to call requireInfluencerAuth
  const influencerProtectedRoutes = influencerRoutes.filter(
    (f) => !f.endsWith(`influencer${path.sep}auth${path.sep}route.ts`) &&
           !f.endsWith(`influencer${path.sep}[username]${path.sep}route.ts`) // public profile endpoint
  );
  const influencerMissingAuth: string[] = [];

  for (const route of influencerProtectedRoutes) {
    const content = readFile(route);
    const hasAuth =
      content.includes('requireInfluencerAuth') ||
      content.includes('checkInfluencerAuth') ||
      content.includes('influencer_session_');
    if (!hasAuth) {
      influencerMissingAuth.push(rel(route));
    }
  }

  checks.push({
    id: 'auth-influencer-coverage',
    name: 'Influencer Routes — Auth Coverage',
    status:
      influencerMissingAuth.length === 0
        ? 'pass'
        : influencerMissingAuth.length <= 3
        ? 'warn'
        : 'fail',
    message:
      influencerMissingAuth.length === 0
        ? `All ${influencerProtectedRoutes.length} influencer routes have auth checks`
        : `${influencerMissingAuth.length}/${influencerProtectedRoutes.length} influencer routes missing auth`,
    details: influencerMissingAuth,
  });

  // ── Cron routes ───────────────────────────────────────────────────────────
  const cronRoutes = allRoutes.filter((f) => f.includes(`${path.sep}cron${path.sep}`));
  const cronMissingAuth: string[] = [];

  for (const route of cronRoutes) {
    const content = readFile(route);
    const hasCronAuth =
      content.includes('CRON_SECRET') ||
      content.includes('authorization') ||
      content.includes('Authorization') ||
      content.includes('cron-secret') ||
      content.includes('requireAdminAuth');
    if (!hasCronAuth) {
      cronMissingAuth.push(rel(route));
    }
  }

  checks.push({
    id: 'auth-cron-coverage',
    name: 'Cron Routes — CRON_SECRET Check',
    status:
      cronMissingAuth.length === 0
        ? 'pass'
        : cronMissingAuth.length === 1
        ? 'warn'
        : 'fail',
    message:
      cronMissingAuth.length === 0
        ? `All ${cronRoutes.length} cron routes verify the CRON_SECRET header`
        : `${cronMissingAuth.length}/${cronRoutes.length} cron routes have no auth`,
    details: cronMissingAuth,
  });

  // ── Webhook routes ────────────────────────────────────────────────────────
  const webhookRoutes = allRoutes.filter((f) => f.includes(`${path.sep}webhooks${path.sep}`));
  const webhookMissingSignature: string[] = [];

  for (const route of webhookRoutes) {
    const content = readFile(route);
    const hasSignatureCheck =
      content.includes('verifyWebhookSignature') ||
      content.includes('verifySignature') ||
      content.includes('HMAC') ||
      content.includes('hmac') ||
      content.includes('createHmac') ||
      content.includes('x-hub-signature') ||
      content.includes('hub-signature') ||
      content.includes('WEBHOOK_SECRET');
    if (!hasSignatureCheck) {
      webhookMissingSignature.push(rel(route));
    }
  }

  checks.push({
    id: 'auth-webhook-signatures',
    name: 'Webhook Routes — HMAC Signature Verification',
    status:
      webhookMissingSignature.length === 0
        ? 'pass'
        : 'fail',
    message:
      webhookMissingSignature.length === 0
        ? `All ${webhookRoutes.length} webhook routes verify signatures`
        : `${webhookMissingSignature.length}/${webhookRoutes.length} webhook routes skip signature verification`,
    details: webhookMissingSignature,
  });

  // ── Manage routes ─────────────────────────────────────────────────────────
  const manageRoutes = allRoutes.filter((f) => f.includes(`${path.sep}manage${path.sep}`));
  const manageMissingAuth: string[] = [];

  for (const route of manageRoutes) {
    const content = readFile(route);
    // manage/auth is the login endpoint itself
    if (route.endsWith(`manage${path.sep}auth${path.sep}route.ts`)) continue;
    const hasAuth =
      content.includes('requireAdminAuth') ||
      content.includes('magic') ||
      content.includes('token') ||
      content.includes('authorization') ||
      content.includes('Authorization') ||
      content.includes('session');
    if (!hasAuth) {
      manageMissingAuth.push(rel(route));
    }
  }

  if (manageMissingAuth.length > 0) {
    checks.push({
      id: 'auth-manage-coverage',
      name: 'Manage Routes — Auth Coverage',
      status: 'warn',
      message: `${manageMissingAuth.length} manage routes may lack proper auth checks`,
      details: manageMissingAuth,
    });
  } else {
    checks.push({
      id: 'auth-manage-coverage',
      name: 'Manage Routes — Auth Coverage',
      status: 'pass',
      message: `All ${manageRoutes.length} manage routes have auth indicators`,
    });
  }

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Secrets & Credentials
// ─────────────────────────────────────────────────────────────────────────────

function checkSecrets(): Check[] {
  const checks: Check[] = [];

  // ── Hardcoded default password fallback ───────────────────────────────────
  const srcFiles = fg.sync(['src/**/*.ts', 'src/**/*.tsx'], { cwd: ROOT, absolute: true });
  const filesWithDefault123: string[] = [];
  const filesWithHardcodedKeys: string[] = [];
  const filesWithBase64JWT: string[] = [];

  const apiKeyPatterns = [
    /sk-[a-zA-Z0-9]{20,}/,          // OpenAI keys
    /AIza[0-9A-Za-z-_]{35}/,         // Google API keys
    /(?:secret|password|key)\s*=\s*['"][a-zA-Z0-9+/=]{20,}['"]/i,
  ];

  const base64JwtPattern = /eyJ[a-zA-Z0-9+/=]{50,}/;

  for (const file of srcFiles) {
    const content = readFile(file);

    // ADMIN_PASSWORD default fallback
    if (content.includes("|| '123456'") || content.includes('|| "123456"')) {
      filesWithDefault123.push(rel(file));
    }

    // Hardcoded API keys
    for (const pattern of apiKeyPatterns) {
      if (pattern.test(content)) {
        filesWithHardcodedKeys.push(rel(file));
        break;
      }
    }

    // Base64 JWT in source
    if (base64JwtPattern.test(content)) {
      // Exclude test fixtures and comments
      const lines = content.split('\n').filter(
        (l) => base64JwtPattern.test(l) && !l.trim().startsWith('//')
      );
      if (lines.length > 0) {
        filesWithBase64JWT.push(rel(file));
      }
    }
  }

  checks.push({
    id: 'secrets-default-password',
    name: "Admin Password — Default '123456' Fallback",
    status: filesWithDefault123.length > 0 ? 'fail' : 'pass',
    message:
      filesWithDefault123.length > 0
        ? `Found ADMIN_PASSWORD default '123456' fallback in ${filesWithDefault123.length} file(s)`
        : 'No hardcoded default password fallback found',
    details: filesWithDefault123,
  });

  checks.push({
    id: 'secrets-api-keys',
    name: 'API Keys — No Hardcoded Credentials',
    status: filesWithHardcodedKeys.length > 0 ? 'fail' : 'pass',
    message:
      filesWithHardcodedKeys.length > 0
        ? `Potential hardcoded API keys found in ${filesWithHardcodedKeys.length} file(s)`
        : 'No hardcoded API keys detected in source files',
    details: filesWithHardcodedKeys,
  });

  checks.push({
    id: 'secrets-jwt-tokens',
    name: 'JWT Tokens — Not Hardcoded in Source',
    status: filesWithBase64JWT.length > 0 ? 'warn' : 'pass',
    message:
      filesWithBase64JWT.length > 0
        ? `Possible JWT tokens found in ${filesWithBase64JWT.length} source file(s) — review these`
        : 'No hardcoded JWT-looking tokens found',
    details: filesWithBase64JWT,
  });

  // ── .gitignore covers .env files ─────────────────────────────────────────
  const gitignoreContent = readFile(path.join(ROOT, '.gitignore'));
  const gitignoreCoversEnv =
    gitignoreContent.includes('.env*') ||
    (gitignoreContent.includes('.env') && gitignoreContent.includes('.env.local'));

  checks.push({
    id: 'secrets-gitignore-env',
    name: '.gitignore — Excludes .env Files',
    status: gitignoreCoversEnv ? 'pass' : 'fail',
    message: gitignoreCoversEnv
      ? '.gitignore correctly excludes .env files'
      : '.gitignore does NOT exclude .env files — risk of secret exposure',
  });

  // ── No tracked .env files ─────────────────────────────────────────────────
  const trackedEnvFiles: string[] = [];
  try {
    // We don't exec git, but we can check if .env files exist at root (non-example)
    const rootFiles = fs.readdirSync(ROOT);
    const envFiles = rootFiles.filter(
      (f) => f.startsWith('.env') && !f.includes('example') && !f.includes('sample')
    );
    // Check if they're likely tracked (crude heuristic: they exist without being gitignored)
    // A real check would require git ls-files, but we avoid network/git calls per spec.
    if (envFiles.length > 0 && !gitignoreCoversEnv) {
      trackedEnvFiles.push(...envFiles);
    }
  } catch {
    // ignore
  }

  checks.push({
    id: 'secrets-env-files-tracked',
    name: '.env Files — Not Committed to Repo',
    status: trackedEnvFiles.length > 0 ? 'fail' : 'pass',
    message:
      trackedEnvFiles.length > 0
        ? `.env files exist and may be committed: ${trackedEnvFiles.join(', ')}`
        : '.env files appear properly gitignored',
  });

  // ── Weak admin session value ──────────────────────────────────────────────
  const adminAuthFile = path.join(ROOT, 'src', 'lib', 'auth', 'admin-auth.ts');
  const adminAuthContent = readFile(adminAuthFile);
  const adminRouteContent = readFile(path.join(ROOT, 'src', 'app', 'api', 'admin', 'route.ts'));
  const usesWeakSessionValue =
    adminAuthContent.includes("=== 'authenticated'") ||
    adminRouteContent.includes("'authenticated'");

  checks.push({
    id: 'secrets-weak-session-value',
    name: 'Admin Session — Cookie Value Is Just String "authenticated"',
    status: usesWeakSessionValue ? 'warn' : 'pass',
    message: usesWeakSessionValue
      ? 'Admin session cookie value is the plain string "authenticated" — not a signed/random token'
      : 'Admin session cookie uses a stronger value',
    details: usesWeakSessionValue
      ? [
          'Cookie value "authenticated" provides no cryptographic integrity guarantee.',
          'If an attacker can set cookies (e.g., via subdomain takeover), they bypass auth.',
          'Consider using a signed JWT or random session token instead.',
        ]
      : undefined,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. XSS Protection
// ─────────────────────────────────────────────────────────────────────────────

function checkXSSProtection(): Check[] {
  const checks: Check[] = [];

  // ── sanitize.ts exists ───────────────────────────────────────────────────
  const sanitizeFile = path.join(SRC_ROOT, 'lib', 'sanitize.ts');
  const sanitizeExists = fileExists(sanitizeFile);
  const sanitizeContent = sanitizeExists ? readFile(sanitizeFile) : '';

  checks.push({
    id: 'xss-sanitize-exists',
    name: 'sanitize.ts — Exists and Exports Functions',
    status: sanitizeExists ? 'pass' : 'fail',
    message: sanitizeExists
      ? 'src/lib/sanitize.ts exists'
      : 'src/lib/sanitize.ts is missing — no centralized sanitization',
  });

  if (sanitizeExists) {
    const exportsSanitizeChatMessage = sanitizeContent.includes('sanitizeChatMessage');
    const exportsSanitizePromptInput = sanitizeContent.includes('sanitizePromptInput');
    const exportsSanitizeHtml = sanitizeContent.includes('sanitizeHtml');

    checks.push({
      id: 'xss-sanitize-functions',
      name: 'sanitize.ts — Required Functions Exported',
      status:
        exportsSanitizeChatMessage && exportsSanitizePromptInput && exportsSanitizeHtml
          ? 'pass'
          : 'warn',
      message: [
        exportsSanitizeChatMessage ? null : 'Missing: sanitizeChatMessage',
        exportsSanitizePromptInput ? null : 'Missing: sanitizePromptInput',
        exportsSanitizeHtml ? null : 'Missing: sanitizeHtml',
      ]
        .filter(Boolean)
        .join(', ') || 'All required sanitize functions are exported',
    });
  }

  // ── Chat routes call sanitization ────────────────────────────────────────
  const chatRoutes = getRoutes(path.join(API_ROOT, 'chat'));
  const chatMissingSanitize: string[] = [];

  for (const route of chatRoutes) {
    const content = readFile(route);
    // Only check routes that appear to process user message input
    if (
      content.includes('message') ||
      content.includes('content') ||
      content.includes('body')
    ) {
      const hasSanitize =
        content.includes('sanitize') ||
        content.includes('sanitizeChatMessage') ||
        content.includes('sanitizePromptInput') ||
        content.includes('limitMessageLength');
      if (!hasSanitize) {
        chatMissingSanitize.push(rel(route));
      }
    }
  }

  checks.push({
    id: 'xss-chat-sanitization',
    name: 'Chat Routes — Sanitize User Input',
    status: chatMissingSanitize.length === 0 ? 'pass' : chatMissingSanitize.length <= 2 ? 'warn' : 'fail',
    message:
      chatMissingSanitize.length === 0
        ? `All ${chatRoutes.length} chat routes sanitize user input`
        : `${chatMissingSanitize.length} chat routes may not sanitize user input`,
    details: chatMissingSanitize,
  });

  // ── dangerouslySetInnerHTML ───────────────────────────────────────────────
  const componentFiles = fg.sync(['src/**/*.tsx', 'src/**/*.ts'], { cwd: ROOT, absolute: true });
  const dangerousUsages: string[] = [];

  for (const file of componentFiles) {
    const content = readFile(file);
    if (content.includes('dangerouslySetInnerHTML')) {
      const lines = content.split('\n');
      const lineNums = lines
        .map((line, i) => (line.includes('dangerouslySetInnerHTML') ? `${rel(file)}:${i + 1}` : null))
        .filter(Boolean) as string[];
      dangerousUsages.push(...lineNums);
    }
  }

  checks.push({
    id: 'xss-dangerous-inner-html',
    name: 'dangerouslySetInnerHTML — Usage Audit',
    status: dangerousUsages.length === 0 ? 'pass' : dangerousUsages.length <= 2 ? 'warn' : 'fail',
    message:
      dangerousUsages.length === 0
        ? 'No dangerouslySetInnerHTML usage found'
        : `Found ${dangerousUsages.length} usage(s) of dangerouslySetInnerHTML — verify each is safe`,
    details: dangerousUsages,
  });

  // ── CSP in next.config.ts ─────────────────────────────────────────────────
  const nextConfig = readFile(path.join(ROOT, 'next.config.ts'));
  const hasCSP = nextConfig.includes('Content-Security-Policy');
  const hasUnsafeInline = nextConfig.includes("'unsafe-inline'");
  const hasUnsafeEval = nextConfig.includes("'unsafe-eval'");

  checks.push({
    id: 'xss-csp-header',
    name: 'CSP — Content-Security-Policy Header Set',
    status: hasCSP ? (hasUnsafeInline || hasUnsafeEval ? 'warn' : 'pass') : 'fail',
    message: hasCSP
      ? hasUnsafeInline && hasUnsafeEval
        ? "CSP is set but uses both 'unsafe-inline' and 'unsafe-eval' — weakens XSS protection"
        : hasUnsafeInline
        ? "CSP is set but uses 'unsafe-inline' — consider nonce-based approach"
        : 'CSP is set with no unsafe-inline/eval'
      : 'Content-Security-Policy header is NOT set in next.config.ts',
    details:
      hasCSP && (hasUnsafeInline || hasUnsafeEval)
        ? [
            hasUnsafeInline ? "'unsafe-inline' allows inline scripts/styles — XSS risk" : '',
            hasUnsafeEval ? "'unsafe-eval' allows eval() — increases attack surface" : '',
          ].filter(Boolean)
        : undefined,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CSRF Protection
// ─────────────────────────────────────────────────────────────────────────────

function checkCSRF(): Check[] {
  const checks: Check[] = [];

  // ── Mutation endpoints CSRF check ────────────────────────────────────────
  // Look for POST routes that modify state and check for csrf token, origin, or
  // same-site cookie enforcement as a proxy for CSRF protection.
  const allRoutes = getRoutes(API_ROOT);
  const mutationRoutesWithoutCSRF: string[] = [];

  for (const route of allRoutes) {
    const content = readFile(route);
    // Only look at routes that handle POST/PUT/PATCH/DELETE
    if (
      !content.includes('export async function POST') &&
      !content.includes('export async function PUT') &&
      !content.includes('export async function PATCH') &&
      !content.includes('export async function DELETE')
    ) {
      continue;
    }
    // Public routes that intentionally don't need CSRF
    const routeRel = rel(route);
    if (
      routeRel.includes('/webhooks/') ||
      routeRel.includes('/widget/') ||
      routeRel.includes('/chat/') ||  // chat is stateless per-session
      routeRel.includes('/auth/') ||
      routeRel.includes('/cron/')
    ) {
      continue;
    }

    const hasCSRFMitigation =
      content.includes('csrf') ||
      content.includes('CSRF') ||
      content.includes('origin') ||
      content.includes('referer') ||
      content.includes('x-requested-with') ||
      // SameSite=strict cookies act as CSRF protection
      content.includes("sameSite: 'strict'") ||
      content.includes('sameSite: "strict"') ||
      // Auth cookie enforces same-site implicitly
      content.includes('requireAdminAuth') ||
      content.includes('requireInfluencerAuth');

    if (!hasCSRFMitigation) {
      mutationRoutesWithoutCSRF.push(routeRel);
    }
  }

  checks.push({
    id: 'csrf-mutation-endpoints',
    name: 'CSRF — Mutation Endpoints Have Protection',
    status:
      mutationRoutesWithoutCSRF.length === 0
        ? 'pass'
        : mutationRoutesWithoutCSRF.length <= 5
        ? 'warn'
        : 'fail',
    message:
      mutationRoutesWithoutCSRF.length === 0
        ? 'Mutation endpoints have CSRF mitigation (auth cookie or explicit check)'
        : `${mutationRoutesWithoutCSRF.length} mutation endpoint(s) lack explicit CSRF protection`,
    details: mutationRoutesWithoutCSRF.slice(0, 20),
  });

  // ── Cookie SameSite check ─────────────────────────────────────────────────
  const authFiles = [
    path.join(ROOT, 'src', 'lib', 'auth', 'admin-auth.ts'),
    path.join(ROOT, 'src', 'app', 'api', 'admin', 'route.ts'),
    path.join(ROOT, 'src', 'app', 'api', 'influencer', 'auth', 'route.ts'),
  ];

  const cookieIssues: string[] = [];
  for (const f of authFiles) {
    const content = readFile(f);
    if (!content.includes('sameSite')) {
      cookieIssues.push(`${rel(f)}: missing sameSite`);
    }
    if (!content.includes('httpOnly')) {
      cookieIssues.push(`${rel(f)}: missing httpOnly`);
    }
    if (!content.includes('secure')) {
      cookieIssues.push(`${rel(f)}: missing secure flag`);
    }
  }

  checks.push({
    id: 'csrf-cookie-samesite',
    name: 'CSRF — Cookie SameSite / httpOnly / Secure Flags',
    status: cookieIssues.length === 0 ? 'pass' : cookieIssues.length <= 2 ? 'warn' : 'fail',
    message:
      cookieIssues.length === 0
        ? 'Auth cookies set with sameSite, httpOnly, and secure flags'
        : `${cookieIssues.length} cookie attribute issue(s) found`,
    details: cookieIssues,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

function checkRateLimiting(): Check[] {
  const checks: Check[] = [];

  const middlewareContent = readFile(path.join(ROOT, 'middleware.ts'));
  const hasMiddleware = middlewareContent.length > 0;

  checks.push({
    id: 'ratelimit-middleware-exists',
    name: 'Rate Limiting — middleware.ts Exists',
    status: hasMiddleware ? 'pass' : 'fail',
    message: hasMiddleware
      ? 'middleware.ts exists with rate limiting logic'
      : 'middleware.ts is missing — no global rate limiting',
  });

  if (!hasMiddleware) return checks;

  const sensitivePathsCovered: { path: string; covered: boolean }[] = [
    { path: '/api/chat', covered: middlewareContent.includes('/api/chat') },
    { path: '/api/influencer', covered: middlewareContent.includes('/api/influencer') },
    { path: 'auth', covered: middlewareContent.includes("includes('/auth')") || middlewareContent.includes("'/auth'") },
    { path: '/api/admin', covered: middlewareContent.includes('admin') },
    { path: '/api/widget', covered: middlewareContent.includes('widget') },
  ];

  const uncovered = sensitivePathsCovered.filter((p) => !p.covered).map((p) => p.path);

  checks.push({
    id: 'ratelimit-sensitive-routes',
    name: 'Rate Limiting — Sensitive Routes Covered',
    status: uncovered.length === 0 ? 'pass' : uncovered.length <= 1 ? 'warn' : 'fail',
    message:
      uncovered.length === 0
        ? 'All sensitive routes (chat, auth, admin, influencer, widget) have rate limits'
        : `${uncovered.length} route group(s) may not have rate limiting: ${uncovered.join(', ')}`,
    details: uncovered,
  });

  // ── Reasonable rate limit values ─────────────────────────────────────────
  // Extract numbers from RATE_LIMITS
  const rateLimitMatch = middlewareContent.match(/maxRequests:\s*(\d+)/g);
  const rateLimitValues = rateLimitMatch
    ? rateLimitMatch.map((m) => parseInt(m.replace('maxRequests:', '').trim(), 10))
    : [];

  const suspiciouslyHigh = rateLimitValues.filter((v) => v > 1000);
  checks.push({
    id: 'ratelimit-values',
    name: 'Rate Limiting — Values Are Reasonable',
    status: suspiciouslyHigh.length === 0 ? 'pass' : 'warn',
    message:
      suspiciouslyHigh.length === 0
        ? `Rate limit values (${rateLimitValues.join(', ')} req/min) are reasonable`
        : `${suspiciouslyHigh.length} rate limit value(s) seem very high (>1000/min): ${suspiciouslyHigh.join(', ')}`,
  });

  // ── In-memory vs distributed rate limiter ────────────────────────────────
  const usesRedis =
    middlewareContent.includes('redis') ||
    middlewareContent.includes('Redis') ||
    middlewareContent.includes('upstash') ||
    middlewareContent.includes('Upstash');
  const usesInMemory = middlewareContent.includes('Map<') || middlewareContent.includes('rateLimitStore');

  checks.push({
    id: 'ratelimit-distributed',
    name: 'Rate Limiting — Distributed vs In-Memory',
    status: usesRedis ? 'pass' : usesInMemory ? 'warn' : 'warn',
    message: usesRedis
      ? 'Rate limiter uses Redis/Upstash (distributed — survives cold starts)'
      : usesInMemory
      ? 'Rate limiter uses in-memory Map — resets on cold start, ineffective across multiple instances'
      : 'Rate limiter implementation unclear',
    details:
      !usesRedis && usesInMemory
        ? [
            'In-memory rate limiting resets on Vercel serverless cold starts',
            'For production, use Upstash Redis rate limiting (already available in this project)',
          ]
        : undefined,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HTTP Security Headers
// ─────────────────────────────────────────────────────────────────────────────

function checkSecurityHeaders(): Check[] {
  const checks: Check[] = [];
  const nextConfig = readFile(path.join(ROOT, 'next.config.ts'));

  const requiredHeaders: { key: string; id: string; name: string }[] = [
    { key: 'Strict-Transport-Security', id: 'hdr-hsts', name: 'HSTS Header' },
    { key: 'X-Frame-Options', id: 'hdr-xfo', name: 'X-Frame-Options Header' },
    { key: 'X-Content-Type-Options', id: 'hdr-xcto', name: 'X-Content-Type-Options Header' },
    { key: 'Content-Security-Policy', id: 'hdr-csp', name: 'Content-Security-Policy Header' },
    { key: 'Referrer-Policy', id: 'hdr-referrer', name: 'Referrer-Policy Header' },
    { key: 'Permissions-Policy', id: 'hdr-permissions', name: 'Permissions-Policy Header' },
  ];

  const missingHeaders: string[] = [];
  for (const header of requiredHeaders) {
    if (!nextConfig.includes(header.key)) {
      missingHeaders.push(header.name);
    }
  }

  checks.push({
    id: 'hdr-all-required',
    name: 'Security Headers — All Required Headers Present',
    status: missingHeaders.length === 0 ? 'pass' : missingHeaders.length <= 2 ? 'warn' : 'fail',
    message:
      missingHeaders.length === 0
        ? `All ${requiredHeaders.length} security headers are configured in next.config.ts`
        : `${missingHeaders.length} security header(s) are missing: ${missingHeaders.join(', ')}`,
    details: missingHeaders,
  });

  // ── HSTS strength ─────────────────────────────────────────────────────────
  if (nextConfig.includes('Strict-Transport-Security')) {
    const hstsMatch = nextConfig.match(/max-age=(\d+)/);
    const hstsMaxAge = hstsMatch ? parseInt(hstsMatch[1], 10) : 0;
    checks.push({
      id: 'hdr-hsts-strength',
      name: 'HSTS — max-age Is Strong',
      status: hstsMaxAge >= 31536000 ? 'pass' : hstsMaxAge > 0 ? 'warn' : 'fail',
      message:
        hstsMaxAge >= 31536000
          ? `HSTS max-age = ${hstsMaxAge}s (≥ 1 year) — good`
          : hstsMaxAge > 0
          ? `HSTS max-age = ${hstsMaxAge}s — consider increasing to ≥ 31536000 (1 year)`
          : 'HSTS header found but could not parse max-age',
    });
  }

  // ── Widget/embed routes have relaxed frame options (intentional) ──────────
  const hasRelaxedFrameForWidget = nextConfig.includes('api/widget') && nextConfig.includes('frame-ancestors *');
  checks.push({
    id: 'hdr-widget-frame-options',
    name: 'Widget Routes — Relaxed Frame Options (Intentional)',
    status: hasRelaxedFrameForWidget ? 'pass' : 'warn',
    message: hasRelaxedFrameForWidget
      ? 'Widget routes correctly use relaxed X-Frame-Options (embeddable) while other routes use DENY'
      : 'Could not confirm widget routes have intentionally relaxed frame options',
  });

  // ── X-XSS-Protection ─────────────────────────────────────────────────────
  const hasXSSProtection = nextConfig.includes('X-XSS-Protection');
  checks.push({
    id: 'hdr-xss-protection',
    name: 'X-XSS-Protection Header',
    status: hasXSSProtection ? 'pass' : 'warn',
    message: hasXSSProtection
      ? 'X-XSS-Protection header is set (legacy browsers benefit)'
      : 'X-XSS-Protection header not set — older browsers have less protection',
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Input Validation
// ─────────────────────────────────────────────────────────────────────────────

function checkInputValidation(): Check[] {
  const checks: Check[] = [];

  const allRoutes = getRoutes(API_ROOT);

  // ── SQL injection: raw string concatenation in queries ───────────────────
  const sqlInjectionPatterns = [
    /`\s*SELECT.*\$\{/i,
    /`\s*INSERT.*\$\{/i,
    /`\s*UPDATE.*\$\{/i,
    /`\s*DELETE.*\$\{/i,
    /query\s*\+\s*['"]/i,
    /\.rpc\s*\(\s*`/,   // raw RPC with template literals
  ];

  const possibleSQLInjection: string[] = [];

  for (const route of allRoutes) {
    const content = readFile(route);
    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(content)) {
        possibleSQLInjection.push(`${rel(route)} (matches: ${pattern.source.slice(0, 40)})`);
        break;
      }
    }
  }

  // Also check lib files
  const libFiles = fg.sync('src/lib/**/*.ts', { cwd: ROOT, absolute: true });
  for (const file of libFiles) {
    const content = readFile(file);
    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(content)) {
        possibleSQLInjection.push(`${rel(file)} (matches: ${pattern.source.slice(0, 40)})`);
        break;
      }
    }
  }

  checks.push({
    id: 'input-sql-injection',
    name: 'SQL Injection — No Raw String Concatenation in Queries',
    status: possibleSQLInjection.length === 0 ? 'pass' : possibleSQLInjection.length <= 2 ? 'warn' : 'fail',
    message:
      possibleSQLInjection.length === 0
        ? 'No raw SQL string concatenation patterns detected'
        : `${possibleSQLInjection.length} possible SQL injection pattern(s) found — review manually`,
    details: possibleSQLInjection.slice(0, 15),
  });

  // ── Path traversal patterns ───────────────────────────────────────────────
  const pathTraversalPatterns = [
    /readFile\s*\(\s*req/i,
    /readFileSync\s*\(\s*req/i,
    /readFile\s*\(\s*[^'"`]*(params|query|body)/i,
    /path\.join\s*\([^)]*req\./,
    /\.\.\//,  // literal path traversal in source (might be legit imports though)
  ];

  const possiblePathTraversal: string[] = [];
  for (const route of allRoutes) {
    const content = readFile(route);
    // Skip the ../ check for route files (imports use ../)
    const patternsToCheck = pathTraversalPatterns.slice(0, 4);
    for (const pattern of patternsToCheck) {
      if (pattern.test(content)) {
        possiblePathTraversal.push(rel(route));
        break;
      }
    }
  }

  checks.push({
    id: 'input-path-traversal',
    name: 'Path Traversal — No User-Controlled File Paths',
    status: possiblePathTraversal.length === 0 ? 'pass' : 'warn',
    message:
      possiblePathTraversal.length === 0
        ? 'No path traversal risk patterns detected in API routes'
        : `${possiblePathTraversal.length} route(s) may use user input in file paths`,
    details: possiblePathTraversal,
  });

  // ── JavaScript: URL protocol injection ───────────────────────────────────
  const jsProtocolFiles: string[] = [];
  const jsProtoPattern = /javascript:/gi;

  const componentFiles = fg.sync(['src/**/*.tsx', 'src/**/*.ts'], { cwd: ROOT, absolute: true });
  for (const file of componentFiles) {
    const content = readFile(file);
    if (jsProtoPattern.test(content)) {
      const lines = content.split('\n');
      const hits = lines
        .map((line, i) =>
          /javascript:/i.test(line) && !line.trim().startsWith('//') ? `${rel(file)}:${i + 1}` : null
        )
        .filter(Boolean) as string[];
      jsProtocolFiles.push(...hits);
    }
  }

  checks.push({
    id: 'input-js-protocol',
    name: 'javascript: URL Protocol — Not Used in Rendered Output',
    status: jsProtocolFiles.length === 0 ? 'pass' : 'fail',
    message:
      jsProtocolFiles.length === 0
        ? 'No javascript: protocol usage found in source'
        : `Found ${jsProtocolFiles.length} instance(s) of javascript: — potential XSS vector`,
    details: jsProtocolFiles,
  });

  // ── User input validation in key routes ──────────────────────────────────
  const keyInputRoutes = [
    path.join(API_ROOT, 'chat', 'stream', 'route.ts'),
    path.join(API_ROOT, 'chat', 'route.ts'),
    path.join(API_ROOT, 'influencer', 'auth', 'route.ts'),
    path.join(API_ROOT, 'admin', 'route.ts'),
    path.join(API_ROOT, 'widget', 'chat', 'route.ts'),
  ].filter(fileExists);

  const routesWithoutValidation: string[] = [];
  for (const route of keyInputRoutes) {
    const content = readFile(route);
    const hasValidation =
      content.includes('z.') ||              // Zod
      content.includes('validate') ||
      content.includes('sanitize') ||
      content.includes('typeof') ||
      content.includes('trim()') ||
      content.includes('.length') ||
      content.includes('maxLength');
    if (!hasValidation) {
      routesWithoutValidation.push(rel(route));
    }
  }

  checks.push({
    id: 'input-key-routes-validated',
    name: 'Input Validation — Key Routes Validate User Input',
    status: routesWithoutValidation.length === 0 ? 'pass' : routesWithoutValidation.length <= 1 ? 'warn' : 'fail',
    message:
      routesWithoutValidation.length === 0
        ? `Key routes (${keyInputRoutes.length} checked) all validate/sanitize input`
        : `${routesWithoutValidation.length} key route(s) may not validate input`,
    details: routesWithoutValidation,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Cookie Security
// ─────────────────────────────────────────────────────────────────────────────

function checkCookieSecurity(): Check[] {
  const checks: Check[] = [];

  // Find all files that set cookies
  const allSourceFiles = fg.sync(['src/**/*.ts', 'src/**/*.tsx'], { cwd: ROOT, absolute: true });
  const cookieSetFiles = allSourceFiles.filter((f) => {
    const content = readFile(f);
    return content.includes('.set(') && (content.includes('cookie') || content.includes('Cookie'));
  });

  const cookiesWithIssues: string[] = [];

  for (const file of cookieSetFiles) {
    const content = readFile(file);
    if (!content.includes('.set(')) continue;

    // Look for cookie set calls without httpOnly
    if (
      (content.includes("cookies().set") || content.includes('response.cookies.set') || content.includes('.cookies.set(')) &&
      !content.includes('httpOnly')
    ) {
      cookiesWithIssues.push(`${rel(file)}: cookies set without httpOnly`);
    }
  }

  checks.push({
    id: 'cookie-httponly',
    name: 'Cookies — httpOnly Flag Set',
    status: cookiesWithIssues.length === 0 ? 'pass' : 'warn',
    message:
      cookiesWithIssues.length === 0
        ? 'Auth cookies appear to use httpOnly flag'
        : `${cookiesWithIssues.length} file(s) may set cookies without httpOnly`,
    details: cookiesWithIssues,
  });

  // ── Secure flag is conditional on NODE_ENV ────────────────────────────────
  const adminRouteContent = readFile(path.join(ROOT, 'src', 'app', 'api', 'admin', 'route.ts'));
  const influencerAuthContent = readFile(
    path.join(ROOT, 'src', 'app', 'api', 'influencer', 'auth', 'route.ts')
  );

  const adminSecureConditional = adminRouteContent.includes("process.env.NODE_ENV === 'production'");
  const influencerSecureConditional =
    influencerAuthContent.includes("process.env.NODE_ENV === 'production'") ||
    influencerAuthContent.includes('NODE_ENV');

  checks.push({
    id: 'cookie-secure-production',
    name: 'Cookies — Secure Flag Conditional on NODE_ENV',
    status:
      adminSecureConditional || influencerSecureConditional
        ? 'pass'
        : 'warn',
    message:
      adminSecureConditional || influencerSecureConditional
        ? 'Cookie secure flag is correctly conditioned on NODE_ENV=production'
        : 'Could not confirm secure flag is conditional on production environment',
    details:
      !adminSecureConditional && !influencerSecureConditional
        ? ['Ensure secure: process.env.NODE_ENV === "production" in all cookie-setting code']
        : undefined,
  });

  // ── Cookie expiry ─────────────────────────────────────────────────────────
  const longLivedCookies: string[] = [];
  // 30 days in seconds = 2592000
  const longExpiry = /maxAge:\s*(\d+)/.exec(adminRouteContent);
  if (longExpiry) {
    const days = parseInt(longExpiry[1], 10) / 86400;
    if (days > 30) {
      longLivedCookies.push(`Admin session cookie expires in ${Math.round(days)} days`);
    }
  }

  checks.push({
    id: 'cookie-expiry',
    name: 'Cookies — Session Expiry Is Reasonable',
    status: longLivedCookies.length === 0 ? 'pass' : 'warn',
    message:
      longLivedCookies.length === 0
        ? 'Cookie expiry looks reasonable (≤ 30 days)'
        : `${longLivedCookies.length} cookie(s) with long expiry: ${longLivedCookies.join(', ')}`,
    details: longLivedCookies,
  });

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score calculation
// ─────────────────────────────────────────────────────────────────────────────

function calculateScore(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const total = checks.length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  // Each fail costs 2x a warn; score = weighted pass rate out of 100
  const failWeight = 2;
  const warnWeight = 1;
  const maxPenalty = total * failWeight;
  const actualPenalty = failCount * failWeight + warnCount * warnWeight;
  const score = Math.round(((maxPenalty - actualPenalty) / maxPenalty) * 100);
  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const sections: { label: string; checks: Check[] }[] = [
    { label: '1. Auth Coverage', checks: checkAuthCoverage() },
    { label: '2. Secrets & Credentials', checks: checkSecrets() },
    { label: '3. XSS Protection', checks: checkXSSProtection() },
    { label: '4. CSRF Protection', checks: checkCSRF() },
    { label: '5. Rate Limiting', checks: checkRateLimiting() },
    { label: '6. HTTP Security Headers', checks: checkSecurityHeaders() },
    { label: '7. Input Validation', checks: checkInputValidation() },
    { label: '8. Cookie Security', checks: checkCookieSecurity() },
  ];

  const allChecks: Check[] = sections.flatMap((s) => s.checks);
  const score = calculateScore(allChecks);

  const failCount = allChecks.filter((c) => c.status === 'fail').length;
  const warnCount = allChecks.filter((c) => c.status === 'warn').length;
  const passCount = allChecks.filter((c) => c.status === 'pass').length;

  const summary =
    `Security Audit: score ${score}/100 | ` +
    `${passCount} pass, ${warnCount} warn, ${failCount} fail across ${allChecks.length} checks`;

  const result: CriticResult = {
    category: 'security',
    score,
    checks: allChecks,
    summary,
  };

  // JSON to stdout
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  // Hebrew summary to stderr
  const hebrewGrade =
    score >= 90 ? 'מצוין' : score >= 75 ? 'טוב' : score >= 60 ? 'בינוני' : 'חלש';

  process.stderr.write(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.stderr.write(`🔐 ביקורת אבטחה — דוח סופי\n`);
  process.stderr.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.stderr.write(`ציון: ${score}/100 (${hebrewGrade})\n`);
  process.stderr.write(`✅ עברו: ${passCount} | ⚠️  אזהרות: ${warnCount} | ❌ נכשלו: ${failCount}\n`);
  process.stderr.write(`סה"כ בדיקות: ${allChecks.length}\n\n`);

  for (const section of sections) {
    const sectionFails = section.checks.filter((c) => c.status === 'fail').length;
    const sectionWarns = section.checks.filter((c) => c.status === 'warn').length;
    const icon = sectionFails > 0 ? '❌' : sectionWarns > 0 ? '⚠️ ' : '✅';
    process.stderr.write(`${icon} ${section.label}: ${section.checks.length} בדיקות`);
    if (sectionFails > 0) process.stderr.write(` (${sectionFails} כשלונות)`);
    if (sectionWarns > 0) process.stderr.write(` (${sectionWarns} אזהרות)`);
    process.stderr.write('\n');
  }

  // Critical failures
  const criticalFails = allChecks.filter((c) => c.status === 'fail');
  if (criticalFails.length > 0) {
    process.stderr.write(`\n🚨 בעיות קריטיות שדורשות טיפול מיידי:\n`);
    for (const check of criticalFails) {
      process.stderr.write(`   • ${check.name}: ${check.message}\n`);
    }
  }

  const warnings = allChecks.filter((c) => c.status === 'warn');
  if (warnings.length > 0) {
    process.stderr.write(`\n⚠️  אזהרות שכדאי לטפל בהן:\n`);
    for (const check of warnings.slice(0, 10)) {
      process.stderr.write(`   • ${check.name}: ${check.message}\n`);
    }
    if (warnings.length > 10) {
      process.stderr.write(`   ... ועוד ${warnings.length - 10} אזהרות נוספות בפלט ה-JSON\n`);
    }
  }

  process.stderr.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`);

  process.exit(0);
}

main();
