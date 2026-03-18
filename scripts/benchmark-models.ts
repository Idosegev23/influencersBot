/**
 * Benchmark chat models: response time + quality
 * Tests gpt-5.4 (current), gpt-5.4-mini, gpt-5.4-nano against israel_bidur persona
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/benchmark-models.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================
// Config
// ============================================

const MODELS = [
  'gpt-5.4',                    // Current production model
  'gpt-5.4-mini-2026-03-17',    // New mini
  'gpt-5.4-nano-2026-03-17',    // New nano
];

const ACCOUNT_ID = '7c773762-908c-4e94-9097-943748b369bd'; // israel_bidur

// Test prompts — mix of Hebrew chat scenarios
const TEST_PROMPTS = [
  { label: 'שאלה פשוטה', message: 'היי מה קורה?' },
  { label: 'שאלה על תוכן', message: 'ספר לי על הזוג החדש של בן צור' },
  { label: 'שאלה על מוצר', message: 'יש קופון הנחה למשהו?' },
  { label: 'שאלה מורכבת', message: 'מה הדברים הכי מעניינים שקרו באחרונה בעולם הסלבריטאים בישראל?' },
  { label: 'איות מורכב', message: 'תכתוב לי סיכום על טקס הנתבים ומי היו שם' },
];

// ============================================
// Load persona for system prompt
// ============================================

async function loadPersona(): Promise<string> {
  const { createClient } = await import('../src/lib/supabase/server');
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('*')
    .eq('account_id', ACCOUNT_ID)
    .single();

  if (!persona) {
    throw new Error('No persona found for israel_bidur');
  }

  return `אתה הבוט של ישראל בידור - עמוד מדיה ובידור ישראלי.
שם: ${persona.name || 'ישראל בידור'}
ביו: ${persona.bio || ''}
טון: ${persona.tone || ''}
הנחיות: ${Array.isArray(persona.directives) ? persona.directives.join(', ') : persona.directives || ''}
נושאים: ${Array.isArray(persona.interests) ? persona.interests.join(', ') : persona.interests || ''}

ענה בעברית, בטון שיחתי וקליל. תהיה קצר וענייני.`;
}

// ============================================
// Run single model test
// ============================================

interface TestResult {
  model: string;
  prompt: string;
  label: string;
  response: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  firstTokenMs: number | null;
}

async function testModel(
  model: string,
  systemPrompt: string,
  userMessage: string,
  label: string
): Promise<TestResult> {
  const start = Date.now();
  let firstTokenMs: number | null = null;
  let fullResponse = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    // Use streaming to measure time-to-first-token
    const stream = await openai.responses.create({
      model,
      instructions: systemPrompt,
      input: userMessage,
      max_output_tokens: 1024,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        if (firstTokenMs === null) {
          firstTokenMs = Date.now() - start;
        }
        fullResponse += (event as any).delta || '';
      }
      if (event.type === 'response.completed') {
        const usage = (event as any).response?.usage;
        if (usage) {
          tokensIn = usage.input_tokens || 0;
          tokensOut = usage.output_tokens || 0;
        }
      }
    }
  } catch (err: any) {
    fullResponse = `[ERROR] ${err.message}`;
  }

  const latencyMs = Date.now() - start;

  return {
    model,
    prompt: userMessage,
    label,
    response: fullResponse,
    latencyMs,
    tokensIn,
    tokensOut,
    firstTokenMs,
  };
}

// ============================================
// Quality Analysis
// ============================================

function analyzeQuality(response: string): {
  charCount: number;
  wordCount: number;
  hasHebrew: boolean;
  hasEmoji: boolean;
  endsWithPunctuation: boolean;
  suspectedSpellingIssues: string[];
} {
  const charCount = response.length;
  const wordCount = response.split(/\s+/).filter(Boolean).length;
  const hasHebrew = /[\u0590-\u05FF]/.test(response);
  const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(response);
  const endsWithPunctuation = /[.!?…]$/.test(response.trim());

  // Common Hebrew spelling mistakes to check
  const spellingPatterns = [
    { pattern: /אינסטגראם/, note: 'אינסטגרם (without א)' },
    { pattern: /פייסבוק/, note: 'OK - פייסבוק is accepted' },
    { pattern: /[א-ת]e[א-ת]/, note: 'English letter mixed in Hebrew' },
    { pattern: /\?\?+/, note: 'Multiple question marks' },
    { pattern: /!!+/, note: 'Multiple exclamation marks' },
    { pattern: /\s{2,}/, note: 'Extra spaces' },
  ];

  const suspectedSpellingIssues: string[] = [];
  for (const sp of spellingPatterns) {
    if (sp.pattern.test(response)) {
      suspectedSpellingIssues.push(sp.note);
    }
  }

  return { charCount, wordCount, hasHebrew, hasEmoji, endsWithPunctuation, suspectedSpellingIssues };
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🏁 Model Benchmark: gpt-5.4 vs gpt-5.4-mini vs gpt-5.4-nano');
  console.log('   Account: israel_bidur');
  console.log('='.repeat(70) + '\n');

  // Load persona
  console.log('📋 Loading persona...');
  const systemPrompt = await loadPersona();
  console.log('   ✓ Persona loaded\n');

  const allResults: TestResult[] = [];

  // Run tests
  for (const prompt of TEST_PROMPTS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📝 Test: "${prompt.label}" — "${prompt.message}"`);
    console.log('─'.repeat(60));

    for (const model of MODELS) {
      const shortName = model.replace('gpt-5.4', '5.4').replace('-2026-03-17', '');
      process.stdout.write(`   ⏳ ${shortName}...`);

      const result = await testModel(model, systemPrompt, prompt.message, prompt.label);
      allResults.push(result);

      const quality = analyzeQuality(result.response);

      console.log(` ${result.latencyMs}ms (TTFT: ${result.firstTokenMs}ms) | ${quality.wordCount} words`);

      // Print response (truncated)
      const truncated = result.response.length > 200
        ? result.response.substring(0, 200) + '...'
        : result.response;
      console.log(`      💬 ${truncated}`);

      if (quality.suspectedSpellingIssues.length > 0) {
        console.log(`      ⚠️  Spelling: ${quality.suspectedSpellingIssues.join(', ')}`);
      }
    }
  }

  // ============================================
  // Summary Table
  // ============================================

  console.log('\n\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));

  // Group by model
  for (const model of MODELS) {
    const modelResults = allResults.filter(r => r.model === model);
    const avgLatency = Math.round(modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length);
    const avgTTFT = Math.round(
      modelResults.filter(r => r.firstTokenMs !== null).reduce((s, r) => s + (r.firstTokenMs || 0), 0) /
      modelResults.filter(r => r.firstTokenMs !== null).length
    );
    const avgWords = Math.round(modelResults.reduce((s, r) => s + analyzeQuality(r.response).wordCount, 0) / modelResults.length);
    const totalTokensIn = modelResults.reduce((s, r) => s + r.tokensIn, 0);
    const totalTokensOut = modelResults.reduce((s, r) => s + r.tokensOut, 0);
    const allSpelling = modelResults.flatMap(r => analyzeQuality(r.response).suspectedSpellingIssues);
    const errors = modelResults.filter(r => r.response.startsWith('[ERROR]')).length;

    const shortName = model.replace('-2026-03-17', '');
    console.log(`\n  📌 ${shortName}`);
    console.log(`     ├─ Avg Latency:     ${avgLatency}ms`);
    console.log(`     ├─ Avg TTFT:        ${avgTTFT}ms`);
    console.log(`     ├─ Avg Words:       ${avgWords}`);
    console.log(`     ├─ Total Tokens:    ${totalTokensIn} in / ${totalTokensOut} out`);
    console.log(`     ├─ Spelling Issues: ${allSpelling.length > 0 ? allSpelling.join(', ') : 'None'}`);
    console.log(`     └─ Errors:          ${errors}/${modelResults.length}`);
  }

  // Speed comparison
  const currentAvg = allResults.filter(r => r.model === MODELS[0]).reduce((s, r) => s + r.latencyMs, 0) / TEST_PROMPTS.length;

  console.log('\n\n📈 Speed Comparison vs gpt-5.4:');
  for (const model of MODELS.slice(1)) {
    const modelAvg = allResults.filter(r => r.model === model).reduce((s, r) => s + r.latencyMs, 0) / TEST_PROMPTS.length;
    const speedup = (currentAvg / modelAvg).toFixed(2);
    const shortName = model.replace('-2026-03-17', '');
    console.log(`   ${shortName}: ${speedup}x ${modelAvg < currentAvg ? 'faster' : 'slower'} (${Math.round(modelAvg)}ms vs ${Math.round(currentAvg)}ms)`);
  }

  // ============================================
  // Full Responses for manual review
  // ============================================

  console.log('\n\n' + '='.repeat(70));
  console.log('📝 FULL RESPONSES (for manual spelling/quality review)');
  console.log('='.repeat(70));

  for (const prompt of TEST_PROMPTS) {
    console.log(`\n\n━━━ "${prompt.label}" ━━━`);
    for (const model of MODELS) {
      const result = allResults.find(r => r.model === model && r.label === prompt.label);
      if (!result) continue;
      const shortName = model.replace('-2026-03-17', '');
      console.log(`\n  [${shortName}] (${result.latencyMs}ms):`);
      console.log(`  ${result.response}`);
    }
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✅ Benchmark complete!');
  console.log('='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
