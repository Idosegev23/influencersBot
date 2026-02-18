#!/usr/bin/env npx tsx
/**
 * Payload Snapshot Script
 *
 * Generates redacted snapshots of the chat payload for regression testing.
 *
 * Usage:
 *   npx tsx scripts/snapshot-payload.ts --account <id> --session <id> [--memory-v2]
 *
 * Outputs a JSON snapshot of what the LLM would receive, without actually calling the LLM.
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const accountId = getArg('account');
const sessionId = getArg('session');
const memoryV2 = args.includes('--memory-v2');

if (!accountId || !sessionId) {
  console.log('Usage: npx tsx scripts/snapshot-payload.ts --account <id> --session <id> [--memory-v2]');
  process.exit(1);
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 1. Load history (same query as stream/route.ts)
  const { data: historyMessages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(10);

  const conversationHistory = (historyMessages || [])
    .reverse()
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // 2. Load rolling summary if memory-v2
  let rollingSummary: string | null = null;
  if (memoryV2) {
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('rolling_summary, message_count')
      .eq('id', sessionId)
      .single();
    rollingSummary = session?.rolling_summary || null;
  }

  // 3. Redact content (keep structure, truncate text)
  const redact = (text: string, maxLen = 80) =>
    text.length > maxLen ? text.substring(0, maxLen) + '...[REDACTED]' : text;

  const snapshot = {
    meta: {
      accountId,
      sessionId,
      memoryV2,
      timestamp: new Date().toISOString(),
    },
    payload: {
      systemPrompt: '[archetype + personality + rules' + (memoryV2 ? ' + grounding directive' : '') + ']',
      rollingSummary: rollingSummary ? redact(rollingSummary) : null,
      historyMessages: conversationHistory.map((m, i) => ({
        position: i,
        role: m.role,
        contentPreview: redact(m.content),
        contentLength: m.content.length,
      })),
      userPrompt: '[FTS knowledge context + user message]',
    },
    ordering: [
      'messages[0]: system (archetype + personality + rules' + (memoryV2 ? ' + grounding' : '') + ')',
      ...(rollingSummary ? ['messages[1]: assistant (rolling summary)'] : []),
      ...conversationHistory.map((m, i) => `messages[${i + 1 + (rollingSummary ? 1 : 0)}]: ${m.role}`),
      `messages[last]: user (knowledge context + question)`,
    ],
    stats: {
      historyCount: conversationHistory.length,
      totalHistoryChars: conversationHistory.reduce((s, m) => s + m.content.length, 0),
      estimatedHistoryTokens: Math.ceil(conversationHistory.reduce((s, m) => s + m.content.length, 0) / 4),
      summaryChars: rollingSummary?.length || 0,
      summaryTokens: rollingSummary ? Math.ceil(rollingSummary.length / 4) : 0,
    },
  };

  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
