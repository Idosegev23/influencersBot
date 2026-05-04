/**
 * 🧪 SUPER QA — Full Product Audit Orchestrator
 *
 * Runs ALL critic scripts and produces a unified report.
 * Covers 15 quality layers × 5 perspective hats.
 *
 * Run: npx tsx scripts/run-all-critics.ts
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface Check {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string[];
}

interface CriticResult {
  category: string;
  score: number;
  checks: Check[];
  summary: string;
}

interface CriticModule {
  name: string;
  file: string;
  icon: string;
  hat: string; // Which perspective hat
}

const CRITICS: CriticModule[] = [
  { name: 'קוד ואיכות', file: 'critic-agent.ts', icon: '🔨', hat: '🧠 מוצר' },
  { name: 'אבטחה וסייבר', file: 'critic-security.ts', icon: '🔐', hat: '🔐 האקר' },
  { name: 'UX ונגישות', file: 'critic-ux-audit.ts', icon: '🎨', hat: '🎭 משתמש' },
  { name: 'ביזנס וביצועים', file: 'critic-business.ts', icon: '💰', hat: '📊 ביזנס' },
];

function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getGradeColor(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 80) return '🟡';
  if (score >= 70) return '🟠';
  return '🔴';
}

/**
 * Normalize different critic output formats into CriticResult[]
 * Some scripts output {category, score, checks}, others {totalScore, categories, ...}
 */
function normalizeResults(parsed: any, fallbackName: string): CriticResult[] {
  // Already an array of CriticResult
  if (Array.isArray(parsed)) {
    return parsed.map(r => ({
      category: r.category || fallbackName,
      score: r.score ?? r.totalScore ?? 0,
      checks: r.checks || [],
      summary: r.summary || '',
    }));
  }

  // UX-style: { totalScore, categories: [{name, score, checks}] }
  if (parsed.categories && Array.isArray(parsed.categories)) {
    return parsed.categories.map((cat: any) => ({
      category: cat.name || cat.category || fallbackName,
      score: cat.score ?? 0,
      checks: (cat.checks || []).map((c: any) => ({
        id: c.id || c.name || 'unknown',
        name: c.name || c.id || 'unknown',
        status: c.status || (c.pass ? 'pass' : 'fail'),
        message: c.message || c.details || '',
        details: c.details ? (Array.isArray(c.details) ? c.details : [c.details]) : undefined,
      })),
      summary: cat.summary || '',
    }));
  }

  // Single CriticResult object
  return [{
    category: parsed.category || fallbackName,
    score: parsed.score ?? parsed.totalScore ?? 0,
    checks: parsed.checks || [],
    summary: parsed.summary || '',
  }];
}

function runCritic(critic: CriticModule): CriticResult[] {
  const scriptPath = path.join(__dirname, critic.file);

  const tmpFile = path.join(os.tmpdir(), `critic-${Date.now()}.json`);
  try {
    console.error(`   ${critic.icon} מריץ ${critic.name}...`);
    execSync(
      `npx tsx ${scriptPath} > ${tmpFile} 2>/dev/null`,
      {
        cwd: path.join(__dirname, '..'),
        timeout: 120_000,
        encoding: 'utf-8',
        shell: '/bin/bash',
      }
    );

    const output = fs.readFileSync(tmpFile, 'utf-8').trim();
    fs.unlinkSync(tmpFile);

    const parsed = JSON.parse(output);
    const results = normalizeResults(parsed, critic.name);
    const score = results[0]?.score ?? 0;
    console.error(`   ${critic.icon} ${critic.name}: ${score}/100`);
    return results;
  } catch (error: any) {
    // Try reading tmp file even on error
    try {
      if (fs.existsSync(tmpFile)) {
        const output = fs.readFileSync(tmpFile, 'utf-8').trim();
        fs.unlinkSync(tmpFile);
        if (output) {
          const parsed = JSON.parse(output);
          const results = Array.isArray(parsed) ? parsed : [parsed];
          console.error(`   ${critic.icon} ${critic.name}: ${results[0]?.score ?? 0}/100`);
          return results;
        }
      }
    } catch { /* fall through */ }

    console.error(`   ❌ ${critic.name}: ${error.message?.substring(0, 100)}`);
    return [{
      category: critic.name,
      score: 0,
      checks: [{ id: 'run-error', name: 'Execution Error', status: 'fail' as const, message: error.message?.substring(0, 200) || 'Unknown error' }],
      summary: 'שגיאה בהרצה',
    }];
  }
}

async function main() {
  const startTime = Date.now();

  console.error(`\n${'═'.repeat(60)}`);
  console.error(`  🧪 SUPER QA — ביקורת מוצר מקיפה`);
  console.error(`  📅 ${new Date().toLocaleDateString('he-IL')} ${new Date().toLocaleTimeString('he-IL')}`);
  console.error(`${'═'.repeat(60)}\n`);
  console.error(`🎭 5 כובעים: משתמש | לקוח | מוצר | האקר | ביזנס`);
  console.error(`📋 15 שכבות איכות × 4 מודולי בדיקה\n`);

  // Run all critics
  const allResults: CriticResult[] = [];

  for (const critic of CRITICS) {
    const results = runCritic(critic);
    allResults.push(...results);
  }

  // Calculate overall score
  const scores = allResults.map(r => r.score);
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // Count issues
  const allChecks = allResults.flatMap(r => r.checks || []);
  const failCount = allChecks.filter(c => c?.status === 'fail').length;
  const warnCount = allChecks.filter(c => c?.status === 'warn').length;
  const passCount = allChecks.filter(c => c?.status === 'pass').length;
  const totalChecks = allChecks.length;

  // Group results by category for display
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print full report
  console.error(`\n${'═'.repeat(60)}`);
  console.error(`  ביקורת מוצר — דו"ח מפורט`);
  console.error(`${'═'.repeat(60)}\n`);

  console.error(`📊 ציון כללי: ${overallScore}/100 ${getGradeColor(overallScore)} (${getGrade(overallScore)})\n`);
  console.error(`   ✅ עברו: ${passCount} | ⚠️ אזהרות: ${warnCount} | ❌ נכשלו: ${failCount} | סה"כ: ${totalChecks} בדיקות\n`);

  // Per-category breakdown
  for (const result of allResults) {
    const icon = result.score >= 80 ? '✅' : result.score >= 60 ? '⚠️' : '❌';
    console.error(`${icon} ${result.category}: ${result.score}/100`);

    // Show failures and warnings
    const issues = (result.checks || []).filter(c => c?.status === 'fail' || c?.status === 'warn');
    for (const issue of issues) {
      const statusIcon = issue.status === 'fail' ? '  ❌' : '  ⚠️';
      console.error(`${statusIcon} ${issue.name}: ${issue.message}`);
      if (issue.details && issue.details.length > 0) {
        const showDetails = issue.details.slice(0, 3);
        for (const d of showDetails) {
          console.error(`     → ${d}`);
        }
        if (issue.details.length > 3) {
          console.error(`     → ...ועוד ${issue.details.length - 3}`);
        }
      }
    }
    console.error('');
  }

  // Critical issues summary
  const criticalFails = allChecks.filter(c => c?.status === 'fail');
  if (criticalFails.length > 0) {
    console.error(`${'─'.repeat(60)}`);
    console.error(`🚨 ${criticalFails.length} בעיות קריטיות לטיפול:\n`);
    for (let i = 0; i < criticalFails.length; i++) {
      const fail = criticalFails[i];
      console.error(`  ${i + 1}. ${fail.name}`);
      console.error(`     מה: ${fail.message}`);
      if (fail.details && fail.details.length > 0) {
        console.error(`     איפה: ${fail.details[0]}`);
      }
    }
  }

  console.error(`\n${'═'.repeat(60)}`);
  console.error(`  ⏱️ זמן ריצה: ${duration} שניות`);
  console.error(`  📋 ${CRITICS.length} מודולים | ${totalChecks} בדיקות | ${failCount} כשלונות`);
  console.error(`${'═'.repeat(60)}\n`);

  // Output JSON to stdout for programmatic use
  const fullReport = {
    timestamp: new Date().toISOString(),
    overallScore,
    grade: getGrade(overallScore),
    totalChecks,
    passed: passCount,
    warnings: warnCount,
    failures: failCount,
    durationSeconds: parseFloat(duration),
    categories: allResults,
  };

  console.log(JSON.stringify(fullReport, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
