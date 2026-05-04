/**
 * Export every Instagram-DM conversation where the LDRS bot replied,
 * to both a human-readable Markdown report and a structured JSON file.
 *
 * Usage:
 *   npx tsx scripts/export-ldrs-ig-dm-conversations.ts
 *
 * Outputs (relative to repo root):
 *   ldrs-ig-dm-conversations.md
 *   ldrs-ig-dm-conversations.json
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import path from 'path';

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface SessionRow {
  id: string;
  thread_id: string;
  created_at: string;
  message_count: number;
}

interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

function fmt(d: string): string {
  return new Date(d).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function senderFromThread(thread: string): string {
  // dm_ig_graph_<senderId>_<accountId>
  const m = thread.match(/^dm_(?:ig_graph|respondio)_(.+?)_[0-9a-f-]{36}$/);
  return m?.[1] || thread;
}

async function main() {
  // 1. Sessions where the bot replied at least once
  const { data: sessions, error: sErr } = await supabase
    .from('chat_sessions')
    .select('id, thread_id, created_at, message_count')
    .eq('account_id', LDRS_ACCOUNT_ID)
    .or('thread_id.like.dm_ig_graph_%,thread_id.like.dm_respondio_%')
    .order('created_at', { ascending: false });
  if (sErr) throw sErr;

  if (!sessions?.length) {
    console.log('No DM sessions found for LDRS.');
    return;
  }

  const filtered: Array<SessionRow & { messages: MessageRow[]; channel: 'instagram' | 'respondio' }> = [];

  // 2. Pull messages per session, keep only those with assistant replies
  for (const s of sessions as SessionRow[]) {
    const { data: msgs, error: mErr } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', s.id)
      .order('created_at', { ascending: true });
    if (mErr) {
      console.error(`Skipping ${s.id}: ${mErr.message}`);
      continue;
    }
    if (!msgs?.length) continue;

    const hasBotReply = msgs.some((m) => m.role === 'assistant');
    if (!hasBotReply) continue;

    filtered.push({
      ...s,
      channel: s.thread_id.startsWith('dm_ig_graph_') ? 'instagram' : 'respondio',
      messages: msgs as MessageRow[],
    });
  }

  // 3. Markdown report
  const lines: string[] = [];
  lines.push(`# LDRS Instagram DM Conversations — Bot Replies\n`);
  lines.push(
    `**Account:** \`${LDRS_ACCOUNT_ID}\` (ldrs_group)  \n` +
      `**Sessions with bot replies:** ${filtered.length}  \n` +
      `**Generated:** ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n`,
  );
  lines.push(`---\n`);

  // Summary table
  lines.push(`## Summary\n`);
  lines.push(`| # | Channel | IG Sender ID | First reply | Last reply | User msgs | Bot msgs |`);
  lines.push(`|---|---------|--------------|-------------|------------|-----------|----------|`);
  filtered.forEach((s, i) => {
    const userN = s.messages.filter((m) => m.role === 'user').length;
    const botN = s.messages.filter((m) => m.role === 'assistant').length;
    const firstBot = s.messages.find((m) => m.role === 'assistant')?.created_at;
    const lastBot = [...s.messages].reverse().find((m) => m.role === 'assistant')?.created_at;
    lines.push(
      `| ${i + 1} | ${s.channel} | \`${senderFromThread(s.thread_id)}\` | ${firstBot ? fmt(firstBot) : '—'} | ${lastBot ? fmt(lastBot) : '—'} | ${userN} | ${botN} |`,
    );
  });
  lines.push('');

  // Per-session transcripts
  filtered.forEach((s, i) => {
    lines.push(`---\n`);
    lines.push(`## ${i + 1}. ${s.channel.toUpperCase()} · sender \`${senderFromThread(s.thread_id)}\`\n`);
    lines.push(
      `- **session_id:** \`${s.id}\`\n` +
        `- **started:** ${fmt(s.created_at)}\n` +
        `- **messages:** ${s.messages.length}\n`,
    );
    lines.push('');
    s.messages.forEach((m) => {
      const who = m.role === 'user' ? '👤 user' : '🤖 bot';
      lines.push(`**${who}** · ${fmt(m.created_at)}`);
      lines.push('');
      lines.push(m.content || '_(empty)_');
      lines.push('');
    });
  });

  const outDir = path.resolve(__dirname, '..');
  const mdPath = path.join(outDir, 'ldrs-ig-dm-conversations.md');
  const jsonPath = path.join(outDir, 'ldrs-ig-dm-conversations.json');
  writeFileSync(mdPath, lines.join('\n'), 'utf8');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        account_id: LDRS_ACCOUNT_ID,
        generated_at: new Date().toISOString(),
        sessions: filtered,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`✓ Wrote ${filtered.length} sessions`);
  console.log(`  ${mdPath}`);
  console.log(`  ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
