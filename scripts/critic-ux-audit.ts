/**
 * critic-ux-audit.ts
 * ──────────────────
 * Static-analysis UX / UI / Accessibility audit for the influencerbot Next.js project.
 *
 * Usage:
 *   npx tsx scripts/critic-ux-audit.ts [--json] [--no-color]
 *
 * Exit code: always 0 (non-blocking CI helper).
 */

import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Check {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string[];
}

export interface CriticResult {
  category: string;   // e.g. "ui-consistency" | "accessibility" | etc.
  score: number;      // 0-100
  checks: Check[];
  summary: string;
}

export interface AuditReport {
  generatedAt: string;
  projectRoot: string;
  totalScore: number;
  grade: string;
  categories: CriticResult[];
  hebrewSummary: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const SRC_APP = path.join(ROOT, 'src', 'app');
const SRC_COMP = path.join(ROOT, 'src', 'components');
const PUBLIC = path.join(ROOT, 'public');

/** Recursively collect files matching an extension list */
function walkDir(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .next, build artefacts
      if (['.next', 'node_modules', '.git', 'coverage', 'test-results'].includes(entry.name)) continue;
      results.push(...walkDir(full, exts));
    } else if (exts.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

/** Read file content, return '' on error */
function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** Relative path from ROOT (for display) */
function rel(filePath: string): string {
  return filePath.replace(ROOT + '/', '');
}

/** Count regex matches in text */
function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Find all matches with file context */
function findInFiles(
  files: string[],
  re: RegExp,
  maxDetails = 8
): string[] {
  const found: string[] = [];
  for (const f of files) {
    if (found.length >= maxDetails) break;
    const content = readFile(f);
    if (re.test(content)) {
      found.push(rel(f));
    }
  }
  return found;
}

/** Score a category: each failed check costs weight, warn costs half */
function scoreCategory(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const failWeight = 15;
  const warnWeight = 6;
  let deductions = 0;
  for (const c of checks) {
    if (c.status === 'fail') deductions += failWeight;
    if (c.status === 'warn') deductions += warnWeight;
  }
  return Math.max(0, Math.min(100, 100 - deductions));
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

// ─── File lists (computed once) ───────────────────────────────────────────────

const tsxFiles = [
  ...walkDir(SRC_APP, ['.tsx', '.jsx']),
  ...walkDir(SRC_COMP, ['.tsx', '.jsx']),
];

const pageFiles = walkDir(SRC_APP, ['.tsx', '.jsx']).filter(f =>
  f.endsWith('page.tsx') || f.endsWith('page.jsx')
);

const layoutFiles = walkDir(SRC_APP, ['.tsx', '.jsx']).filter(f =>
  f.endsWith('layout.tsx') || f.endsWith('layout.jsx')
);

const allSourceFiles = [
  ...walkDir(SRC_APP, ['.tsx', '.jsx', '.ts', '.js', '.css']),
  ...walkDir(SRC_COMP, ['.tsx', '.jsx', '.ts', '.js', '.css']),
];

const cssFiles = walkDir(path.join(ROOT, 'src'), ['.css']);

// ─── Category 1: UI Consistency ───────────────────────────────────────────────

function auditUIConsistency(): CriticResult {
  const checks: Check[] = [];

  // 1a. Mixed UI libraries (look for imports from radix, chakra, antd, mui, shadcn alongside each other)
  const uiLibPatterns: Record<string, RegExp> = {
    'Radix UI': /from ['"]@radix-ui\//,
    'Chakra UI': /from ['"]@chakra-ui\//,
    'Ant Design': /from ['"]antd['"]/,
    'Material UI': /from ['"]@mui\//,
    'Shadcn UI': /from ['"]@\/components\/ui\//,
    'Headless UI': /from ['"]@headlessui\//,
  };

  const detectedLibs: string[] = [];
  const allContent = tsxFiles.map(f => readFile(f)).join('\n');

  for (const [lib, re] of Object.entries(uiLibPatterns)) {
    if (re.test(allContent)) detectedLibs.push(lib);
  }

  if (detectedLibs.length > 1) {
    checks.push({
      id: 'ui-mixed-libs',
      name: 'Mixed UI Component Libraries',
      status: 'warn',
      message: `Multiple UI libraries detected: ${detectedLibs.join(', ')}. Prefer a single library for consistency.`,
      details: detectedLibs,
    });
  } else {
    checks.push({
      id: 'ui-mixed-libs',
      name: 'Mixed UI Component Libraries',
      status: 'pass',
      message: detectedLibs.length === 1
        ? `Single UI library in use: ${detectedLibs[0]}.`
        : 'No external UI library — using custom + Tailwind (consistent).',
    });
  }

  // 1b. Hardcoded hex / rgb colors in style attributes or JSX
  const hexColorRe = /style=\{[^}]*["']#[0-9a-fA-F]{3,8}["']/;
  const rgbColorRe = /style=\{[^}]*rgb\(/;
  const hexFiles = findInFiles(tsxFiles, hexColorRe);
  const rgbFiles = findInFiles(tsxFiles, rgbColorRe);
  const colorFiles = [...new Set([...hexFiles, ...rgbFiles])];

  // Also check CSS for hardcoded hex that should be Tailwind tokens
  const cssHexFiles = cssFiles.filter(f => {
    const c = readFile(f);
    // Only flag if hex colors are NOT inside @layer or CSS variable definitions
    return /#[0-9a-fA-F]{3,8}/g.test(c) && !f.includes('globals.css');
  });

  checks.push({
    id: 'ui-hardcoded-colors',
    name: 'Hardcoded Colors (hex/rgb in style props)',
    status: colorFiles.length > 0 ? 'warn' : 'pass',
    message: colorFiles.length > 0
      ? `${colorFiles.length} file(s) use hardcoded color values in style props. Use Tailwind classes or CSS variables instead.`
      : 'No hardcoded color values found in style props.',
    details: colorFiles.slice(0, 8),
  });

  // 1c. Hardcoded font sizes in style props
  const fontSizeRe = /style=\{[^}]*fontSize\s*:/;
  const fontSizePxRe = /text-\[\d+px\]/;
  const fontSizeStyleFiles = findInFiles(tsxFiles, fontSizeRe);
  const fontSizePxFiles = findInFiles(tsxFiles, fontSizePxRe);
  const fontFiles = [...new Set([...fontSizeStyleFiles, ...fontSizePxFiles])];

  checks.push({
    id: 'ui-hardcoded-font-sizes',
    name: 'Hardcoded Font Sizes',
    status: fontFiles.length > 3 ? 'warn' : fontFiles.length > 0 ? 'warn' : 'pass',
    message: fontFiles.length > 0
      ? `${fontFiles.length} file(s) use hardcoded font sizes (style.fontSize or text-[Npx]). Use Tailwind text-sm/md/lg etc.`
      : 'Font sizes use Tailwind scale consistently.',
    details: fontFiles.slice(0, 8),
  });

  // 1d. Hardcoded px spacing in style attributes
  const pxSpacingRe = /style=\{[^}]*(padding|margin)\s*:\s*['"]?\d+px/;
  const pxSpacingFiles = findInFiles(tsxFiles, pxSpacingRe);

  checks.push({
    id: 'ui-hardcoded-spacing',
    name: 'Hardcoded Spacing (px in style props)',
    status: pxSpacingFiles.length > 3 ? 'warn' : 'pass',
    message: pxSpacingFiles.length > 0
      ? `${pxSpacingFiles.length} file(s) use pixel spacing in style props. Use Tailwind spacing scale (p-4, m-2, etc.).`
      : 'Spacing uses Tailwind scale.',
    details: pxSpacingFiles.slice(0, 8),
  });

  return {
    category: 'ui-consistency',
    score: scoreCategory(checks),
    checks,
    summary: `UI Consistency: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Category 2: Accessibility ────────────────────────────────────────────────

function auditAccessibility(): CriticResult {
  const checks: Check[] = [];

  // 2a. <img> without alt — raw HTML img tags
  const imgNoAlt: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    // Find <img ...> without alt=
    const imgTags = content.match(/<img\b[^>]*>/g) ?? [];
    const missing = imgTags.filter(tag => !/\balt\s*=/.test(tag));
    if (missing.length > 0) imgNoAlt.push(`${rel(f)} (${missing.length} instance(s))`);
  }

  checks.push({
    id: 'a11y-img-alt',
    name: 'Images Missing alt Attribute',
    status: imgNoAlt.length > 0 ? 'fail' : 'pass',
    message: imgNoAlt.length > 0
      ? `${imgNoAlt.length} file(s) have <img> tags missing alt attribute.`
      : 'All <img> tags have alt attributes.',
    details: imgNoAlt.slice(0, 8),
  });

  // 2b. Next/Image without alt
  const nextImgNoAlt: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (!/<Image\b/.test(content)) continue;
    // Find <Image ... > blocks — look for Image components without alt
    const imageComponents = content.match(/<Image\b[^/]*(?:\/?>|\n[^>]*\/?>)/g) ?? [];
    const missing = imageComponents.filter(tag => !/\balt\s*=/.test(tag));
    if (missing.length > 0) nextImgNoAlt.push(`${rel(f)} (${missing.length} instance(s))`);
  }

  checks.push({
    id: 'a11y-next-image-alt',
    name: 'Next/Image Components Missing alt',
    status: nextImgNoAlt.length > 0 ? 'fail' : 'pass',
    message: nextImgNoAlt.length > 0
      ? `${nextImgNoAlt.length} file(s) have <Image> components potentially missing alt.`
      : 'All <Image> components appear to have alt attributes.',
    details: nextImgNoAlt.slice(0, 8),
  });

  // 2c. Buttons without accessible text (only icon children)
  const iconOnlyButtons: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    // Detect buttons that contain only a lucide/svg icon component with no text
    // Pattern: <button ...> <SomeIcon .../> </button> with no text
    const buttonBlocks = content.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    let count = 0;
    for (const block of buttonBlocks) {
      const hasText = /[א-תa-zA-Z0-9]{2,}/.test(block.replace(/<[^>]+>/g, ''));
      const hasAriaLabel = /aria-label\s*=/.test(block);
      const hasAriaLabelledBy = /aria-labelledby\s*=/.test(block);
      const hasSrOnly = /sr-only/.test(block);
      const hasTitle = /<title/.test(block);
      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy && !hasSrOnly && !hasTitle) {
        count++;
      }
    }
    if (count > 0) iconOnlyButtons.push(`${rel(f)} (${count} button(s))`);
  }

  checks.push({
    id: 'a11y-button-text',
    name: 'Buttons Without Accessible Text',
    status: iconOnlyButtons.length > 0 ? 'warn' : 'pass',
    message: iconOnlyButtons.length > 0
      ? `${iconOnlyButtons.length} file(s) may have icon-only buttons without aria-label or sr-only text.`
      : 'Buttons appear to have accessible text or aria labels.',
    details: iconOnlyButtons.slice(0, 8),
  });

  // 2d. Heading hierarchy — check for h3/h4 without preceding h2, or h2 without h1
  const headingIssues: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    const hasH1 = /<h1\b|className="[^"]*text-[^"]*xl[^"]*"/.test(content);
    const hasH2 = /<h2\b/.test(content);
    const hasH3 = /<h3\b/.test(content);
    if (hasH3 && !hasH2) headingIssues.push(`${rel(f)} — has h3 but no h2`);
    if (hasH2 && !hasH1 && f.includes('/page.')) headingIssues.push(`${rel(f)} — page has h2 but no h1`);
  }

  checks.push({
    id: 'a11y-heading-hierarchy',
    name: 'Heading Hierarchy',
    status: headingIssues.length > 3 ? 'warn' : headingIssues.length > 0 ? 'warn' : 'pass',
    message: headingIssues.length > 0
      ? `${headingIssues.length} file(s) may have heading hierarchy issues.`
      : 'Heading hierarchy appears consistent.',
    details: headingIssues.slice(0, 8),
  });

  // 2e. Interactive elements without aria-label (custom divs/spans with onClick)
  const divOnClickNoAria: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    // Find div/span with onClick that don't have role or aria-label
    const divBlocks = content.match(/<div\b[^>]*onClick[^>]*>/g) ?? [];
    const spanBlocks = content.match(/<span\b[^>]*onClick[^>]*>/g) ?? [];
    const bad = [...divBlocks, ...spanBlocks].filter(
      tag => !/role\s*=/.test(tag) && !/aria-label\s*=/.test(tag)
    );
    if (bad.length > 0) divOnClickNoAria.push(`${rel(f)} (${bad.length} element(s))`);
  }

  checks.push({
    id: 'a11y-div-onclick-role',
    name: 'Clickable Divs Without role="button"',
    status: divOnClickNoAria.length > 0 ? 'warn' : 'pass',
    message: divOnClickNoAria.length > 0
      ? `${divOnClickNoAria.length} file(s) use onClick on div/span without role="button" or aria-label.`
      : 'No bare div/span onClick without role attribute found.',
    details: divOnClickNoAria.slice(0, 8),
  });

  // 2f. Form labels
  const formNoLabel: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (!/<form\b|<input\b|<textarea\b|<select\b/.test(content)) continue;
    const inputs = content.match(/<input\b[^>]*>/g) ?? [];
    const badInputs = inputs.filter(tag => {
      // Skip hidden, submit, button, checkbox types with labels elsewhere
      if (/type\s*=\s*["'](hidden|submit|button|reset|image)["']/.test(tag)) return false;
      return !/aria-label\s*=/.test(tag) && !/id\s*=/.test(tag);
    });
    if (badInputs.length > 0) formNoLabel.push(`${rel(f)} (${badInputs.length} input(s))`);
  }

  checks.push({
    id: 'a11y-form-labels',
    name: 'Form Inputs Without Accessible Labels',
    status: formNoLabel.length > 0 ? 'warn' : 'pass',
    message: formNoLabel.length > 0
      ? `${formNoLabel.length} file(s) have inputs that may lack associated labels.`
      : 'Form inputs appear to have proper labels or aria-label.',
    details: formNoLabel.slice(0, 8),
  });

  // 2g. Low-contrast Tailwind combos
  const lowContrastCombos = [
    { pair: 'text-gray-300 bg-white', re: /text-gray-300[^"]*bg-white|bg-white[^"]*text-gray-300/ },
    { pair: 'text-gray-400 bg-white', re: /text-gray-400[^"]*bg-white|bg-white[^"]*text-gray-400/ },
    { pair: 'text-gray-300 bg-gray-100', re: /text-gray-300[^"]*bg-gray-100|bg-gray-100[^"]*text-gray-300/ },
    { pair: 'text-yellow-300 bg-white', re: /text-yellow-300[^"]*bg-white|bg-white[^"]*text-yellow-300/ },
    { pair: 'text-white bg-yellow-300', re: /text-white[^"]*bg-yellow-300|bg-yellow-300[^"]*text-white/ },
  ];

  const contrastIssues: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    for (const combo of lowContrastCombos) {
      if (combo.re.test(content)) {
        contrastIssues.push(`${rel(f)} — low contrast: ${combo.pair}`);
        break;
      }
    }
  }

  checks.push({
    id: 'a11y-color-contrast',
    name: 'Potential Low Color Contrast',
    status: contrastIssues.length > 0 ? 'warn' : 'pass',
    message: contrastIssues.length > 0
      ? `${contrastIssues.length} file(s) use known low-contrast Tailwind combinations.`
      : 'No known low-contrast Tailwind class combinations detected.',
    details: contrastIssues.slice(0, 8),
  });

  return {
    category: 'accessibility',
    score: scoreCategory(checks),
    checks,
    summary: `Accessibility: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Category 3: Responsive Design ───────────────────────────────────────────

function auditResponsive(): CriticResult {
  const checks: Check[] = [];

  // 3a. Pages without responsive Tailwind classes
  const nonResponsivePages: string[] = [];
  for (const f of pageFiles) {
    const content = readFile(f);
    const hasResponsive = /\b(sm:|md:|lg:|xl:|2xl:)/.test(content);
    if (!hasResponsive) nonResponsivePages.push(rel(f));
  }

  checks.push({
    id: 'responsive-breakpoints',
    name: 'Pages Without Responsive Breakpoints',
    status: nonResponsivePages.length > pageFiles.length * 0.3 ? 'fail'
      : nonResponsivePages.length > 0 ? 'warn' : 'pass',
    message: nonResponsivePages.length > 0
      ? `${nonResponsivePages.length}/${pageFiles.length} page(s) use no responsive Tailwind classes (sm:/md:/lg:).`
      : 'All pages use responsive Tailwind breakpoints.',
    details: nonResponsivePages.slice(0, 8),
  });

  // 3b. Hardcoded fixed widths that break mobile
  const hardcodedWidthRe = /w-\[(?:[5-9]\d{2}|[1-9]\d{3})px\]|style=\{[^}]*width\s*:\s*['"]?\d{3,4}px/;
  const hardcodedWidthFiles = findInFiles(tsxFiles, hardcodedWidthRe);

  checks.push({
    id: 'responsive-fixed-widths',
    name: 'Hardcoded Fixed Widths Breaking Mobile',
    status: hardcodedWidthFiles.length > 0 ? 'warn' : 'pass',
    message: hardcodedWidthFiles.length > 0
      ? `${hardcodedWidthFiles.length} file(s) use fixed widths (w-[500px]+ or style width) that may break on mobile.`
      : 'No problematic fixed widths detected.',
    details: hardcodedWidthFiles.slice(0, 8),
  });

  // 3c. overflow-x-hidden on body/main (mobile hack indicator)
  const overflowHackRe = /overflow-x-hidden|overflow-hidden/;
  const overflowFiles = findInFiles(layoutFiles, overflowHackRe);

  checks.push({
    id: 'responsive-overflow-hack',
    name: 'overflow-x-hidden on Layout (Mobile Hack)',
    status: overflowFiles.length > 0 ? 'warn' : 'pass',
    message: overflowFiles.length > 0
      ? `${overflowFiles.length} layout file(s) use overflow-hidden/overflow-x-hidden — may hide content on mobile.`
      : 'No overflow-x-hidden hack detected on layouts.',
    details: overflowFiles,
  });

  // 3d. Viewport meta tag
  const rootLayout = readFile(path.join(SRC_APP, 'layout.tsx'));
  const hasViewportExport = /export const viewport/.test(rootLayout);
  const hasViewportMeta = /viewport/.test(rootLayout);

  checks.push({
    id: 'responsive-viewport',
    name: 'Viewport Meta Tag / Viewport Export',
    status: hasViewportExport || hasViewportMeta ? 'pass' : 'fail',
    message: hasViewportExport
      ? 'Root layout exports proper Next.js viewport config.'
      : hasViewportMeta
        ? 'Root layout has viewport meta tag.'
        : 'No viewport configuration found in root layout!',
  });

  return {
    category: 'responsive-design',
    score: scoreCategory(checks),
    checks,
    summary: `Responsive Design: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Category 4: Navigation & UX Flows ───────────────────────────────────────

function auditNavigation(): CriticResult {
  const checks: Check[] = [];

  // 4a. Error pages exist
  const notFoundExists = fs.existsSync(path.join(SRC_APP, 'not-found.tsx'));
  const errorExists = fs.existsSync(path.join(SRC_APP, 'error.tsx'));
  const loadingExists = fs.existsSync(path.join(SRC_APP, 'loading.tsx'));

  checks.push({
    id: 'nav-error-pages',
    name: 'Error Pages Exist (not-found, error, loading)',
    status: notFoundExists && errorExists ? 'pass' : 'warn',
    message: [
      notFoundExists ? '✓ not-found.tsx' : '✗ not-found.tsx MISSING',
      errorExists ? '✓ error.tsx' : '✗ error.tsx MISSING',
      loadingExists ? '✓ loading.tsx' : '⚠ loading.tsx missing (optional but recommended)',
    ].join(' | '),
  });

  // 4b. Pages that fetch data should have loading states
  const dataFetchPages: string[] = [];
  const noLoadingIndicator: string[] = [];

  for (const f of pageFiles) {
    const content = readFile(f);
    const fetchesData = /fetch\(|supabase\.|useEffect|useState.*loading|isLoading/.test(content);
    const hasLoadingState = /isLoading|loading|skeleton|Skeleton|Loader|spinner/i.test(content);
    if (fetchesData && !hasLoadingState) {
      noLoadingIndicator.push(rel(f));
    }
  }

  checks.push({
    id: 'nav-loading-states',
    name: 'Data-Fetching Pages Have Loading States',
    status: noLoadingIndicator.length > 3 ? 'warn' : noLoadingIndicator.length > 0 ? 'warn' : 'pass',
    message: noLoadingIndicator.length > 0
      ? `${noLoadingIndicator.length} page(s) fetch data but may lack loading indicators.`
      : 'Pages with data fetching appear to have loading states.',
    details: noLoadingIndicator.slice(0, 8),
  });

  // 4c. Pages with no navigation (dead-end check)
  const deadEndPages: string[] = [];
  for (const f of pageFiles) {
    const content = readFile(f);
    // Skip error/not-found/loading files themselves
    if (/not-found|error\.tsx|loading\.tsx/.test(f)) continue;
    const hasLink = /href=|useRouter|router\.push|Link\b|<a\b/.test(content);
    const hasNav = /NavigationMenu|<nav\b|breadcrumb|Breadcrumb|Back|back/.test(content);
    if (!hasLink && !hasNav) {
      deadEndPages.push(rel(f));
    }
  }

  checks.push({
    id: 'nav-dead-ends',
    name: 'Dead-End Pages (No Navigation Out)',
    status: deadEndPages.length > 0 ? 'warn' : 'pass',
    message: deadEndPages.length > 0
      ? `${deadEndPages.length} page(s) appear to have no navigation links or back actions.`
      : 'All pages have at least one navigation element.',
    details: deadEndPages.slice(0, 8),
  });

  // 4d. Back navigation on sub-pages (non-top-level pages)
  const subPages = pageFiles.filter(f => {
    const rel_ = f.replace(SRC_APP + '/', '');
    return rel_.split('/').length > 2; // deeper than app/page.tsx
  });

  const noBackNav: string[] = [];
  for (const f of subPages) {
    const content = readFile(f);
    const hasBack = /router\.back|href\s*=\s*["']\/|ChevronLeft|ArrowLeft|goBack|Back|breadcrumb/i.test(content);
    if (!hasBack) noBackNav.push(rel(f));
  }

  checks.push({
    id: 'nav-back-button',
    name: 'Sub-Pages Have Back Navigation',
    status: noBackNav.length > subPages.length * 0.4 ? 'warn' : 'pass',
    message: noBackNav.length > 0
      ? `${noBackNav.length}/${subPages.length} sub-page(s) may lack back navigation.`
      : 'Sub-pages appear to have back navigation.',
    details: noBackNav.slice(0, 8),
  });

  return {
    category: 'navigation-ux',
    score: scoreCategory(checks),
    checks,
    summary: `Navigation & UX: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Category 5: RTL & Internationalization ───────────────────────────────────

function auditRTL(): CriticResult {
  const checks: Check[] = [];

  // 5a. dir="rtl" in root layout
  const rootLayoutContent = readFile(path.join(SRC_APP, 'layout.tsx'));
  const hasDirRtl = /dir\s*=\s*["']rtl["']/.test(rootLayoutContent);
  const hasLangHe = /lang\s*=\s*["']he["']/.test(rootLayoutContent);

  checks.push({
    id: 'rtl-dir-attribute',
    name: 'Root Layout Has dir="rtl"',
    status: hasDirRtl ? 'pass' : 'fail',
    message: hasDirRtl
      ? 'Root layout sets dir="rtl" correctly.' + (hasLangHe ? ' lang="he" also set.' : '')
      : 'Root layout is MISSING dir="rtl"! Hebrew RTL will be broken.',
  });

  // 5b. text-left / text-right that should be text-start / text-end
  const textDirectionFiles: string[] = [];
  const textLeftRightRe = /\btext-left\b|\btext-right\b/;
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (textLeftRightRe.test(content)) {
      // Count occurrences
      const count = (content.match(/\btext-left\b|\btext-right\b/g) ?? []).length;
      textDirectionFiles.push(`${rel(f)} (${count}x)`);
    }
  }

  checks.push({
    id: 'rtl-text-alignment',
    name: 'text-left/text-right vs text-start/text-end',
    status: textDirectionFiles.length > 5 ? 'warn' : textDirectionFiles.length > 0 ? 'warn' : 'pass',
    message: textDirectionFiles.length > 0
      ? `${textDirectionFiles.length} file(s) use text-left/text-right. For RTL support, use text-start/text-end.`
      : 'Text alignment classes use RTL-friendly text-start/text-end.',
    details: textDirectionFiles.slice(0, 8),
  });

  // 5c. ml- / mr- that should be ms- / me-
  const marginDirectionFiles: string[] = [];
  const mlMrRe = /\bml-\d|\bmr-\d|\bml-auto\b|\bmr-auto\b/;
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (mlMrRe.test(content)) {
      const count = (content.match(/\bml-\d|\bmr-\d|\bml-auto\b|\bmr-auto\b/g) ?? []).length;
      marginDirectionFiles.push(`${rel(f)} (${count}x)`);
    }
  }

  checks.push({
    id: 'rtl-margin-direction',
    name: 'ml-/mr- vs ms-/me- (RTL Margins)',
    status: marginDirectionFiles.length > 10 ? 'warn' : marginDirectionFiles.length > 0 ? 'warn' : 'pass',
    message: marginDirectionFiles.length > 0
      ? `${marginDirectionFiles.length} file(s) use ml-/mr- instead of ms-/me-. RTL layouts may break.`
      : 'Margins use RTL-friendly ms-/me- classes.',
    details: marginDirectionFiles.slice(0, 8),
  });

  // 5d. Hardcoded direction: ltr in styles
  const ltrOverrideFiles = findInFiles(allSourceFiles, /direction\s*:\s*['"]?ltr/);

  checks.push({
    id: 'rtl-ltr-override',
    name: 'Hardcoded direction: ltr in Styles',
    status: ltrOverrideFiles.length > 0 ? 'warn' : 'pass',
    message: ltrOverrideFiles.length > 0
      ? `${ltrOverrideFiles.length} file(s) override direction to LTR. Check if intentional.`
      : 'No hardcoded direction: ltr overrides found.',
    details: ltrOverrideFiles.slice(0, 8),
  });

  // 5e. pl- / pr- instead of ps- / pe-
  const paddingDirectionFiles: string[] = [];
  const plPrRe = /\bpl-\d|\bpr-\d/;
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (plPrRe.test(content)) {
      const count = (content.match(/\bpl-\d|\bpr-\d/g) ?? []).length;
      paddingDirectionFiles.push(`${rel(f)} (${count}x)`);
    }
  }

  checks.push({
    id: 'rtl-padding-direction',
    name: 'pl-/pr- vs ps-/pe- (RTL Padding)',
    status: paddingDirectionFiles.length > 10 ? 'warn' : paddingDirectionFiles.length > 0 ? 'warn' : 'pass',
    message: paddingDirectionFiles.length > 0
      ? `${paddingDirectionFiles.length} file(s) use pl-/pr- instead of ps-/pe-. RTL padding may be mirrored incorrectly.`
      : 'Padding uses RTL-friendly ps-/pe- classes.',
    details: paddingDirectionFiles.slice(0, 8),
  });

  return {
    category: 'rtl-i18n',
    score: scoreCategory(checks),
    checks,
    summary: `RTL & i18n: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Category 6: Content Quality ─────────────────────────────────────────────

function auditContentQuality(): CriticResult {
  const checks: Check[] = [];

  // 6a. TODO/FIXME in UI components
  const todoFiles: string[] = [];
  const todoRe = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i;
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (todoRe.test(content)) {
      const count = (content.match(/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/gi) ?? []).length;
      todoFiles.push(`${rel(f)} (${count} comment(s))`);
    }
  }

  checks.push({
    id: 'content-todos',
    name: 'TODO/FIXME Comments in UI Files',
    status: todoFiles.length > 5 ? 'warn' : todoFiles.length > 0 ? 'warn' : 'pass',
    message: todoFiles.length > 0
      ? `${todoFiles.length} UI file(s) contain TODO/FIXME comments.`
      : 'No TODO/FIXME comments in UI files.',
    details: todoFiles.slice(0, 8),
  });

  // 6b. Placeholder/Lorem ipsum text
  const placeholderFiles = findInFiles(tsxFiles, /lorem ipsum|Lorem Ipsum|placeholder text|Test content|dummy content/i);

  checks.push({
    id: 'content-placeholders',
    name: 'Placeholder/Lorem Ipsum Text',
    status: placeholderFiles.length > 0 ? 'warn' : 'pass',
    message: placeholderFiles.length > 0
      ? `${placeholderFiles.length} file(s) contain placeholder or lorem ipsum text.`
      : 'No placeholder text found.',
    details: placeholderFiles,
  });

  // 6c. Missing page metadata
  const pagesWithoutMeta: string[] = [];
  for (const f of pageFiles) {
    const content = readFile(f);
    // Server component pages should export metadata
    const isClientComponent = /['"]use client['"]/.test(content);
    const hasMetadata = /export const metadata|export async function generateMetadata/.test(content);
    if (!isClientComponent && !hasMetadata) {
      pagesWithoutMeta.push(rel(f));
    }
  }

  checks.push({
    id: 'content-metadata',
    name: 'Server Pages Without Metadata Export',
    status: pagesWithoutMeta.length > pageFiles.length * 0.3 ? 'warn' : 'pass',
    message: pagesWithoutMeta.length > 0
      ? `${pagesWithoutMeta.length} server page(s) lack metadata export (title, description for SEO).`
      : 'Server pages export metadata.',
    details: pagesWithoutMeta.slice(0, 8),
  });

  // 6d. Broken image references (in src/app and src/components — not dynamic)
  const publicFiles = walkDir(PUBLIC, ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'])
    .map(f => f.replace(PUBLIC, ''));

  const brokenImageRefs: string[] = [];
  const staticImgRe = /(?:src|href)\s*=\s*["'](\/((?!api|_next)[^"']+\.(png|jpg|jpeg|gif|svg|webp|ico)))["']/g;

  for (const f of tsxFiles) {
    const content = readFile(f);
    let match: RegExpExecArray | null;
    const re = new RegExp(staticImgRe.source, 'g');
    while ((match = re.exec(content)) !== null) {
      const imgPath = match[1];
      // Normalise — the public folder serves at /
      if (!publicFiles.includes(imgPath)) {
        brokenImageRefs.push(`${rel(f)} → ${imgPath}`);
      }
    }
  }

  checks.push({
    id: 'content-broken-images',
    name: 'Broken Static Image References',
    status: brokenImageRefs.length > 0 ? 'warn' : 'pass',
    message: brokenImageRefs.length > 0
      ? `${brokenImageRefs.length} potential broken image reference(s) found.`
      : 'Static image references appear valid.',
    details: brokenImageRefs.slice(0, 8),
  });

  return {
    category: 'content-quality',
    score: scoreCategory(checks),
    checks,
    summary: `Content Quality: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Category 7: Interactive Elements ────────────────────────────────────────

function auditInteractiveElements(): CriticResult {
  const checks: Check[] = [];

  // 7a. Buttons without hover/focus states
  const noHoverButtons: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    // Find button elements that don't use hover: or focus: Tailwind classes
    const buttonBlocks = content.match(/<button\b[^>]*>/g) ?? [];
    const bad = buttonBlocks.filter(tag => {
      // Skip disabled buttons
      if (/disabled/.test(tag)) return false;
      return !/hover:|focus:|active:/.test(tag);
    });
    if (bad.length > 0) noHoverButtons.push(`${rel(f)} (${bad.length} button(s))`);
  }

  checks.push({
    id: 'interactive-button-states',
    name: 'Buttons Without hover:/focus: States',
    status: noHoverButtons.length > 3 ? 'warn' : noHoverButtons.length > 0 ? 'warn' : 'pass',
    message: noHoverButtons.length > 0
      ? `${noHoverButtons.length} file(s) have buttons without hover/focus Tailwind classes.`
      : 'Buttons appear to have hover/focus states.',
    details: noHoverButtons.slice(0, 8),
  });

  // 7b. Links distinguishable from text (should have underline, color, or explicit styling)
  const undistinguishedLinks: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    const linkTags = content.match(/<a\b[^>]*>/g) ?? [];
    const plain = linkTags.filter(tag => {
      // Skip nav links, icon links, etc.
      if (/nav|icon|logo|aria-label/.test(tag)) return false;
      return !/underline|text-blue|text-primary|font-medium|font-semibold|hover:/.test(tag);
    });
    if (plain.length > 0) undistinguishedLinks.push(`${rel(f)} (${plain.length} link(s))`);
  }

  checks.push({
    id: 'interactive-link-style',
    name: 'Links Distinguishable from Regular Text',
    status: undistinguishedLinks.length > 2 ? 'warn' : 'pass',
    message: undistinguishedLinks.length > 0
      ? `${undistinguishedLinks.length} file(s) have <a> tags without visible link styling.`
      : 'Links appear to be visually distinguishable.',
    details: undistinguishedLinks.slice(0, 8),
  });

  // 7c. Forms with submit buttons
  const formsNoSubmit: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    if (!/<form\b/.test(content)) continue;
    // Check if there's a submit button or type=submit
    const hasSubmit = /type\s*=\s*["']submit["']|<button[^>]*>/.test(content);
    if (!hasSubmit) formsNoSubmit.push(rel(f));
  }

  checks.push({
    id: 'interactive-form-submit',
    name: 'Forms Have Submit Buttons',
    status: formsNoSubmit.length > 0 ? 'warn' : 'pass',
    message: formsNoSubmit.length > 0
      ? `${formsNoSubmit.length} file(s) have forms that may lack submit buttons.`
      : 'Forms appear to have submit buttons.',
    details: formsNoSubmit,
  });

  // 7d. onClick on non-interactive elements (div/span without role)
  const badClickHandlers: string[] = [];
  const badOnClickRe = /<(?:div|span|li|td|tr)\b[^>]*onClick[^>]*>/g;
  for (const f of tsxFiles) {
    const content = readFile(f);
    const matches = content.match(badOnClickRe) ?? [];
    const bad = matches.filter(tag => !/role\s*=/.test(tag) && !/tabIndex/.test(tag) && !/aria-/.test(tag));
    if (bad.length > 0) badClickHandlers.push(`${rel(f)} (${bad.length} element(s))`);
  }

  checks.push({
    id: 'interactive-div-onclick',
    name: 'Click Handlers on Non-Interactive Elements',
    status: badClickHandlers.length > 3 ? 'warn' : badClickHandlers.length > 0 ? 'warn' : 'pass',
    message: badClickHandlers.length > 0
      ? `${badClickHandlers.length} file(s) use onClick on div/span/li/td without role or tabIndex.`
      : 'No inaccessible click handlers on non-interactive elements.',
    details: badClickHandlers.slice(0, 8),
  });

  // 7e. focus-visible / outline-none without ring (a11y regression)
  const focusRemovedFiles: string[] = [];
  for (const f of tsxFiles) {
    const content = readFile(f);
    const hasOutlineNone = /outline-none|focus:outline-none/.test(content);
    const hasFocusRing = /focus:ring|focus-visible:ring|focus-within:ring/.test(content);
    if (hasOutlineNone && !hasFocusRing) {
      focusRemovedFiles.push(rel(f));
    }
  }

  checks.push({
    id: 'interactive-focus-visible',
    name: 'outline-none Without focus:ring Replacement',
    status: focusRemovedFiles.length > 5 ? 'warn' : focusRemovedFiles.length > 0 ? 'warn' : 'pass',
    message: focusRemovedFiles.length > 0
      ? `${focusRemovedFiles.length} file(s) remove outline without adding a focus ring — keyboard users lose focus indicator.`
      : 'Focus indicators appear preserved.',
    details: focusRemovedFiles.slice(0, 8),
  });

  return {
    category: 'interactive-elements',
    score: scoreCategory(checks),
    checks,
    summary: `Interactive Elements: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed.`,
  };
}

// ─── Aggregate & Print ────────────────────────────────────────────────────────

function buildHebrewSummary(categories: CriticResult[], totalScore: number, grade: string): string {
  const lines: string[] = [
    `═══════════════════════════════════════════`,
    `  ביקורת UX/UI/נגישות — תוצאות`,
    `═══════════════════════════════════════════`,
    `  ציון כולל: ${totalScore}/100  (דרגה: ${grade})`,
    ``,
    `  תוצאות לפי קטגוריה:`,
  ];

  const catNames: Record<string, string> = {
    'ui-consistency': 'עקביות ממשק משתמש',
    'accessibility': 'נגישות (WCAG)',
    'responsive-design': 'עיצוב רספונסיבי',
    'navigation-ux': 'ניווט וזרימת UX',
    'rtl-i18n': 'RTL ורב-לשוניות',
    'content-quality': 'איכות תוכן',
    'interactive-elements': 'אלמנטים אינטראקטיביים',
  };

  for (const cat of categories) {
    const name = catNames[cat.category] ?? cat.category;
    const passed = cat.checks.filter(c => c.status === 'pass').length;
    const warns = cat.checks.filter(c => c.status === 'warn').length;
    const failed = cat.checks.filter(c => c.status === 'fail').length;
    const icon = cat.score >= 80 ? '✓' : cat.score >= 60 ? '⚠' : '✗';
    lines.push(`  ${icon} ${name}: ${cat.score}/100 (עבר: ${passed}, אזהרות: ${warns}, נכשל: ${failed})`);
  }

  lines.push(``);
  lines.push(`  בעיות קריטיות:`);

  const criticalFails = categories.flatMap(cat =>
    cat.checks
      .filter(c => c.status === 'fail')
      .map(c => `  ✗ [${catNames[cat.category] ?? cat.category}] ${c.message}`)
  );

  if (criticalFails.length === 0) {
    lines.push(`  אין בעיות קריטיות — כל הבדיקות קריטיות עברו!`);
  } else {
    lines.push(...criticalFails);
  }

  const warnings = categories.flatMap(cat =>
    cat.checks
      .filter(c => c.status === 'warn')
      .map(c => `  ⚠ [${catNames[cat.category] ?? cat.category}] ${c.message}`)
  );

  if (warnings.length > 0) {
    lines.push(``);
    lines.push(`  אזהרות (${warnings.length}):`);
    lines.push(...warnings.slice(0, 15));
    if (warnings.length > 15) lines.push(`  ... ועוד ${warnings.length - 15} אזהרות`);
  }

  lines.push(`═══════════════════════════════════════════`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const noColor = args.includes('--no-color');

  // Run all audits
  const categories: CriticResult[] = [
    auditUIConsistency(),
    auditAccessibility(),
    auditResponsive(),
    auditNavigation(),
    auditRTL(),
    auditContentQuality(),
    auditInteractiveElements(),
  ];

  // Calculate total score (weighted average)
  const totalScore = Math.round(
    categories.reduce((sum, cat) => sum + cat.score, 0) / categories.length
  );

  const grade = gradeFromScore(totalScore);

  const hebrewSummary = buildHebrewSummary(categories, totalScore, grade);

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    projectRoot: ROOT,
    totalScore,
    grade,
    categories,
    hebrewSummary,
  };

  // JSON output
  const jsonOutput = JSON.stringify(report, null, 2);
  process.stdout.write(jsonOutput + '\n');

  // Hebrew summary to stderr (always visible, doesn't pollute JSON stdout)
  process.stderr.write('\n' + hebrewSummary + '\n\n');

  process.exit(0);
}

main();
