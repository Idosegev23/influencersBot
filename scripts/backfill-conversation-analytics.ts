/**
 * Retro backfill for conversation analytics.
 *
 * Stage 1 is idempotent (UNIQUE on session_id), so this can be re-run safely
 * and stopped at any point — already-classified sessions are skipped and cost
 * nothing the second time.
 *
 *   CRON_SECRET=… BACKFILL_HOST=https://… \
 *     npx tsx scripts/backfill-conversation-analytics.ts \
 *       --account c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1 --since 2026-01-01 --budget 3
 *
 * `--budget` is per round, in USD. The loop stops as soon as a round reports it
 * hit the ceiling, so the total spend is bounded by budget × rounds and the run
 * can never run away.
 */

const HOST = process.env.BACKFILL_HOST || 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET;

const MAX_ROUNDS = 80;
/**
 * Sessions per round. The cron route caps at maxDuration 300s and classification
 * is sequential at roughly 1–3s per session, so a round much larger than this
 * risks being killed mid-run. Overridable with --limit.
 */
const DEFAULT_PER_ROUND_LIMIT = 100;

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function call(path: string): Promise<any> {
  const res = await fetch(`${HOST}${path}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 300)}`);
  }
}

async function main() {
  if (!SECRET) throw new Error('CRON_SECRET is required');
  const account = arg('account');
  const since = arg('since', '2026-01-01');
  const budget = arg('budget', '3');
  const perRound = arg('limit', String(DEFAULT_PER_ROUND_LIMIT));
  if (!account) throw new Error('--account is required');

  console.log(`Backfilling ${account} since ${since} against ${HOST}`);

  let spent = 0;
  let classified = 0;
  let failed = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const json = await call(
      `/api/cron/classify-conversations?account_id=${account}&since=${since}` +
      `&limit=${perRound}&budget=${budget}`
    );

    const r = json.results?.[0];
    if (!r) throw new Error(`no result for the account — is the flag on? ${JSON.stringify(json)}`);
    if (r.error) throw new Error(`round ${round}: ${r.error}`);

    spent += r.spentUsd || 0;
    classified += r.classified || 0;
    failed += r.failed || 0;

    console.log(
      `round ${round}: classified=${r.classified} failed=${r.failed} ` +
      `running total=${classified} spent=$${spent.toFixed(4)}`
    );

    if (r.stoppedOnBudget) {
      console.log('budget ceiling hit — stopping. Re-run to continue.');
      break;
    }
    if ((r.classified || 0) + (r.failed || 0) === 0) {
      console.log('nothing left to classify');
      break;
    }
  }

  console.log(`\nClassification done: ${classified} classified, ${failed} failed, $${spent.toFixed(4)} spent.`);
  console.log('Clustering topics…');

  const cluster = await call(`/api/cron/cluster-conversation-topics?account_id=${account}`);
  console.log('clustering:', JSON.stringify(cluster.results?.[0] ?? cluster));

  console.log('\nNext: hand-check ~20 classifications against the real conversations');
  console.log('before setting config.conversation_analytics.visible = true.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
