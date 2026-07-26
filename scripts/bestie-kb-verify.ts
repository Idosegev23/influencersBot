/**
 * Phase 1 acceptance check: does a customer's own question reach the right
 * knowledge entry?
 *
 * A script rather than a vitest test on purpose. tests/setup.ts sets
 * `global.fetch = vi.fn()` for the whole suite, so nothing running under vitest
 * can talk to a real service — which is correct for unit tests and fatal for a
 * check whose entire point is the real retrieval path.
 *
 * Run: npm run bestie:verify
 * Needs Node >= 22 (`nvm use 22`).
 *
 * Exits non-zero on the first failed expectation, so it can gate a release.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

interface Case {
  name: string;
  query: string;
  check: (sources: any[]) => string | null; // null = pass, string = failure reason
}

const CASES: Case[] = [
  {
    name: 'embedding the chat on a site → chatbot-settings',
    query: 'איך מטמיעים את הצ\'אט באתר שלי?',
    check: sources => {
      const routes = sources.map(s => s.metadata?.route).filter(Boolean);
      return routes.includes('/influencer/[username]/chatbot-settings')
        ? null
        : `expected chatbot-settings, got: ${routes.join(', ') || '(no routed sources)'}`;
    },
  },
  {
    name: 'changing the bot personality → a persona screen',
    query: 'איפה משנים את האישיות של הבוט?',
    check: sources => {
      const routes: string[] = sources.map(s => s.metadata?.route).filter(Boolean);
      return routes.some(r => r.includes('chatbot-persona') || r.includes('chatbot-settings'))
        ? null
        : `expected a persona screen, got: ${routes.join(', ') || '(no routed sources)'}`;
    },
  },
  {
    name: 'no other account leaks into retrieval',
    query: 'מה בסטי עושה?',
    check: sources => {
      if (!sources.length) return 'no sources returned at all';
      const foreign = sources.filter(s => s.metadata?.source !== 'bestie_kb');
      return foreign.length ? `${foreign.length} chunks not from bestie_kb` : null;
    },
  },
  {
    name: 'pricing answer quotes no invented number',
    query: 'כמה זה עולה?',
    check: sources => {
      const pricing = sources.find(
        s => s.sourceId === 'pricing' || String(s.title).includes('כמה זה עולה')
      );
      if (!pricing) return 'pricing entry was not retrieved';
      // Spec §11.1 — a price Bestie was never given is a price she must not state.
      return /\d+\s*(?:₪|שקל|ש"ח|שח)/.test(pricing.excerpt)
        ? `pricing entry quotes a figure: "${pricing.excerpt.slice(0, 80)}"`
        : null;
    },
  },
];

async function main() {
  const { createClient } = await import('../src/lib/supabase/server');
  const { retrieveContext } = await import('../src/lib/rag');

  const supabase = createClient();
  const { data: account, error } = await supabase
    .from('accounts').select('id').eq('config->>username', 'bestie').maybeSingle();
  if (error) throw error;
  if (!account) throw new Error('bestie account not found — run scripts/create-bestie-account.ts');

  let failures = 0;

  for (const testCase of CASES) {
    const { sources } = await retrieveContext({
      accountId: account.id,
      query: testCase.query,
      archetype: 'saas_product',
    });
    const reason = testCase.check(sources);
    if (reason) {
      failures++;
      console.error(`✖ ${testCase.name}\n    ${reason}`);
    } else {
      console.log(`✓ ${testCase.name}`);
    }
  }

  if (failures) {
    console.error(`\n${failures}/${CASES.length} checks failed.`);
    console.error('A miss usually means the entry is written in our words, not the customer\'s.');
    process.exit(1);
  }
  console.log(`\nall ${CASES.length} checks passed`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
