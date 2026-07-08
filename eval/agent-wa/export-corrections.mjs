#!/usr/bin/env node
/**
 * One-off: harvest real agent corrections into new golden cases (Plan Task 10 / P3.16).
 *
 * NOT part of CI. Reads `crm_agent_wa_log` rows where the agent corrected the bot
 * (`agent_corrected = true`) and prints candidate golden JSON to stdout. A human curates
 * the money ground truth before dropping files into eval/agent-wa/golden/ — because the
 * gate is zero-tolerance, an auto-generated `expect.money` that's even 1₪ off would wedge
 * CI. This script only proposes; it never writes to the golden dir and never mutates the DB.
 *
 * Usage:
 *   node eval/agent-wa/export-corrections.mjs [--agent <agent_id>] [--limit 50]
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const agentId = getArg('--agent', null);
const limit = Number(getArg('--limit', '50'));
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  let q = supabase
    .from('crm_agent_wa_log')
    .select('id, agent_id, inbound_text, is_voice, corrected_amount, corrected_line_items, created_at')
    .eq('agent_corrected', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (agentId) q = q.eq('agent_id', agentId);

  const { data, error } = await q;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const candidates = (data || []).map((r, i) => {
    const money =
      r.corrected_amount != null
        ? {
            total: Number(r.corrected_amount),
            ...(Array.isArray(r.corrected_line_items) && r.corrected_line_items.length
              ? { lineItems: r.corrected_line_items.map(Number) }
              : {}),
          }
        : undefined;
    return {
      id: `correction-${i + 1}`,
      input: { text: r.inbound_text || '', ...(r.is_voice ? { isVoice: true } : {}) },
      expect: {
        ...(money ? { money } : {}),
        mustNotLeak: ['brief_id', 'account_id', 'agent_id', 'uuid'],
      },
      _meta: { source_log_id: r.id, agent_id: r.agent_id, created_at: r.created_at },
    };
  });

  // Proposal only — human reviews `expect.money` before saving into golden/.
  console.log(JSON.stringify(candidates, null, 2));
  console.error(`\n${candidates.length} candidate(s) proposed. Review money ground truth, then save curated files into eval/agent-wa/golden/.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
