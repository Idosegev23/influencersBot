/**
 * Pure scoring for the agent-WhatsApp golden eval (Plan Task 10 / P3.16).
 *
 * Two gates, no I/O, no LLM:
 *  - scoreMoney: DETERMINISTIC money-exactness — exact-match unit_price/total with
 *    ZERO tolerance. The money lane's whole promise is "never quote the wrong number",
 *    so a single off-by-one is a hard fail (no rounding, no epsilon).
 *  - scoreLeak: asserts no internal IDs / other-agent names leaked into the reply.
 *
 * These run in CI (see tests/unit/agent-wa-eval-gate.test.ts). Advisory *quality*
 * is judged separately by an LLM-as-judge in runner.ts (behind RUN_LLM_JUDGE=1).
 */

export interface MoneyShape {
  total: number;
  lineItems?: number[];
}

export interface ScoreResult {
  pass: boolean;
  diffs: string[];
}

/**
 * Exact, zero-tolerance money comparison. `total` must match to the shekel; when the
 * expected case pins `lineItems`, both the count and every position must match exactly.
 */
export function scoreMoney(expected: MoneyShape, actual: MoneyShape): ScoreResult {
  const diffs: string[] = [];

  const expTotal = expected?.total;
  const actTotal = actual?.total;
  if (expTotal !== actTotal) diffs.push(`total ${expTotal} != ${actTotal}`);

  if (expected?.lineItems) {
    const exp = expected.lineItems;
    const act = actual?.lineItems;
    if (!act || act.length !== exp.length) {
      diffs.push(`lineItems length mismatch (expected ${exp.length}, got ${act ? act.length : 'none'})`);
    } else {
      exp.forEach((v, i) => {
        if (v !== act[i]) diffs.push(`line[${i}] ${v} != ${act[i]}`);
      });
    }
  }

  return { pass: diffs.length === 0, diffs };
}

export interface LeakResult {
  pass: boolean;
  leaked: string[];
}

/**
 * A reply must never surface an internal identifier (brief_id, account_id, a raw uuid)
 * or another agent's talent name. Any substring hit is a leak.
 */
export function scoreLeak(reply: string, mustNotLeak: string[]): LeakResult {
  const text = String(reply || '');
  const leaked = (mustNotLeak || []).filter((tok) => tok && text.includes(tok));
  return { pass: leaked.length === 0, leaked };
}
