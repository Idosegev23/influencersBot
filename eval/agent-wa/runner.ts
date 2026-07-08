/**
 * Golden-set runner for the agent-WhatsApp advisory brain (Plan Task 10 / P3.16).
 *
 *  1. loadGolden()          — read eval/agent-wa/golden/*.json.
 *  2. extractMoneyFromText  — the DETERMINISTIC money path, built directly on P0's
 *     canonical normalizer (normalizeAmount + parseAmountText from wa-interpret).
 *     This is the ground-truth extractor the CI gate runs; no LLM, fully reproducible.
 *  3. runGolden()           — scores each case's money with zero tolerance (score.ts).
 *  4. judgeAdvisory()       — LLM-as-judge for advisory *quality*, behind RUN_LLM_JUDGE=1.
 *     The judge is the OTHER provider (Gemini), because the agent brain runs on OpenAI
 *     (laneModel('qa')='gpt-5.5') — a same-provider judge would be self-graded.
 *
 * READ-ONLY: nothing here mutates any deal/money table; it only reads golden JSON.
 */
import fs from 'fs';
import path from 'path';
import { scoreMoney, scoreLeak, type MoneyShape } from './score';
import { normalizeAmount, parseAmountText } from '@/lib/crm/wa-interpret';

export type Golden = {
  id: string;
  input: { text: string; isVoice?: boolean };
  context?: any;
  expect: {
    intent?: string;
    money?: MoneyShape;
    mustMention?: string[];
    mustNotLeak?: string[];
  };
};

export function loadGolden(dir = path.resolve(__dirname, 'golden')): Golden[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Golden);
}

/**
 * DETERMINISTIC money extraction — the eval's ground truth.
 *
 * Walks the text for amount phrases (digits, with optional k/אלף/מיליון markers),
 * normalizing each through P0's `normalizeAmount` in pricing context (scaleBare) so a
 * bare "80" resolves to 80,000 exactly as the live money lane would. When no digit is
 * present it falls back to a Hebrew-word amount ("מאתיים אלף" → 200,000).
 *
 *  - 1 amount   → { total }
 *  - ≥2 amounts → { total = sum, lineItems = [each] }
 */
export function extractMoneyFromText(text: string): MoneyShape {
  const src = String(text || '');
  const amounts: number[] = [];

  // Digit-anchored amount phrases: "80", "20,000", "90 אלף", "2 מיליון".
  const re = /(\d[\d,.]*)\s*(k|K|אלף|אלפים|מיליון|מליון)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!m[0].trim()) {
      re.lastIndex++; // guard against zero-width matches
      continue;
    }
    const parsed = parseAmountText(m[0]);
    if (!parsed) continue;
    const n = normalizeAmount(parsed.value, { thousands: parsed.thousands, scaleBare: true });
    if (n.amount > 0) amounts.push(n.amount);
  }

  // No digits → try a pure Hebrew-word amount over the whole string.
  if (amounts.length === 0) {
    const parsed = parseAmountText(src);
    if (parsed) {
      const n = normalizeAmount(parsed.value, { thousands: parsed.thousands, scaleBare: true });
      if (n.amount > 0) amounts.push(n.amount);
    }
  }

  if (amounts.length === 0) return { total: 0 };
  if (amounts.length === 1) return { total: amounts[0] };
  return { total: amounts.reduce((a, b) => a + b, 0), lineItems: amounts };
}

export interface RunRow {
  id: string;
  money?: { pass: boolean; diffs: string[] };
  leak?: { pass: boolean; leaked: string[] };
}

/**
 * Execute the deterministic path over the golden cases. `extractMoney` is injected so
 * the gate can wire the live P0-backed extractor (default: `extractMoneyFromText`).
 * When a case pins `mustNotLeak`, the extracted echo is leak-checked too.
 */
export async function runGolden(
  cases: Golden[],
  deps: { extractMoney: (t: string) => Promise<MoneyShape> | MoneyShape } = { extractMoney: extractMoneyFromText },
): Promise<RunRow[]> {
  const out: RunRow[] = [];
  for (const c of cases) {
    const row: RunRow = { id: c.id };
    if (c.expect?.money) {
      const actual = await deps.extractMoney(c.input.text);
      row.money = scoreMoney(c.expect.money, actual);
    }
    if (c.expect?.mustNotLeak?.length) {
      // The deterministic path never emits identifiers; assert the raw input echo is clean too.
      row.leak = scoreLeak(c.input.text, c.expect.mustNotLeak);
    }
    out.push(row);
  }
  return out;
}

export interface JudgeResult {
  score: number;
  reason: string;
}

/**
 * LLM-as-judge for advisory answer quality — the OTHER provider (Gemini) grades the
 * OpenAI-driven advisory pipeline. Skipped unless RUN_LLM_JUDGE=1 so CI stays
 * deterministic and offline; returns a neutral pass when skipped.
 */
export async function judgeAdvisory(question: string, answer: string, rubric: string): Promise<JudgeResult> {
  if (process.env.RUN_LLM_JUDGE !== '1') return { score: 1, reason: 'skipped (RUN_LLM_JUDGE!=1)' };

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: process.env.AGENT_JUDGE_MODEL || 'gemini-3.5-flash' });

    const prompt =
      `אתה שופט איכות תשובות של יועץ WhatsApp לסוכן טאלנטים. ` +
      `דרג את התשובה בין 0 ל-1 לפי הרובריקה: ${rubric}. ` +
      `החזר JSON בלבד בפורמט {"score":number,"reason":string}.\n\n` +
      `שאלה: ${question}\nתשובה: ${answer}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      reason: String(parsed.reason || ''),
    };
  } catch (err: any) {
    return { score: 0, reason: `judge_error: ${err?.message || err}` };
  }
}
