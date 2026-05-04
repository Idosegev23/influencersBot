/**
 * Resolve every IG sender ID in ldrs-ig-dm-conversations.json to a
 * username/display name via the Instagram Graph API, and emit a contact
 * list LDRS can use to reach back out.
 *
 * Inputs:  ldrs-ig-dm-conversations.json (from export script)
 * Outputs: ldrs-ig-dm-contacts.md, ldrs-ig-dm-contacts.json, ldrs-ig-dm-contacts.csv
 *
 * Usage:
 *   npx tsx scripts/resolve-ldrs-dm-contacts.ts
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

/**
 * IGSID conversation participants only expose a small set of fields.
 * `is_business_account`, `media_count`, `biography` are NOT available —
 * the helper in src/lib/instagram-graph/client.ts requests them and
 * the API rejects the call. We hit the endpoint directly with the
 * known-good field set instead.
 */
async function lookupIgsid(
  igsid: string,
  accessToken: string,
): Promise<{
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  follower_count?: number;
  is_verified_user?: boolean;
}> {
  const fieldSets = [
    'name,username,profile_pic,follower_count,is_verified_user',
    'name,username,profile_pic',
    'name,username',
  ];
  let lastErr: any = null;
  for (const fields of fieldSets) {
    const url = `https://graph.instagram.com/v22.0/${igsid}?fields=${fields}&access_token=${accessToken}`;
    const res = await fetch(url);
    if (res.ok) return res.json();
    lastErr = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    // If the failure is because of missing field (#100), try a smaller set.
    const msg: string = lastErr?.error?.message || '';
    if (!/nonexisting field/i.test(msg)) break;
  }
  throw new Error(lastErr?.error?.message || 'lookup failed');
}

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

async function loadIgAccessToken(): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase
    .from('ig_graph_connections')
    .select('access_token, token_expires_at, ig_username')
    .eq('account_id', LDRS_ACCOUNT_ID)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token) throw new Error('No active ig_graph_connections row for LDRS');
  console.log(`✓ using token for @${data.ig_username} (expires ${data.token_expires_at})`);
  return data.access_token as string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Session {
  id: string;
  thread_id: string;
  channel: string;
  created_at: string;
  message_count: number;
  messages: Message[];
}

interface Contact {
  ig_sender_id: string;
  username: string | null;
  name: string | null;
  follower_count: number | null;
  is_verified: boolean | null;
  resolve_error: string | null;
  channel: string;
  session_id: string;
  thread_id: string;
  user_msgs: number;
  bot_msgs: number;
  first_msg_at: string;
  last_msg_at: string;
  first_user_msg: string;
  last_user_msg: string;
  ig_link: string;
}

function senderFromThread(thread: string): string {
  const m = thread.match(/^dm_(?:ig_graph|respondio)_(.+?)_[0-9a-f-]{36}$/);
  return m?.[1] || thread;
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

function clip(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

function csvCell(v: string | number | null | boolean | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[,"\n]/.test(s) ? `"${s}"` : s;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const input = path.join(root, 'ldrs-ig-dm-conversations.json');
  const raw = readFileSync(input, 'utf8');
  const { sessions } = JSON.parse(raw) as { sessions: Session[] };

  const accessToken = await loadIgAccessToken();
  console.log(`→ resolving ${sessions.length} senders via Instagram Graph API`);

  const contacts: Contact[] = [];

  for (const s of sessions) {
    const senderId = senderFromThread(s.thread_id);
    const userMsgs = s.messages.filter((m) => m.role === 'user');
    const botMsgs = s.messages.filter((m) => m.role === 'assistant');
    const firstUser = userMsgs[0]?.content || '';
    const lastUser = userMsgs[userMsgs.length - 1]?.content || '';
    const firstAt = s.messages[0]?.created_at || s.created_at;
    const lastAt = s.messages[s.messages.length - 1]?.created_at || s.created_at;

    let profile: {
      id?: string;
      name?: string;
      username?: string;
      follower_count?: number;
      is_verified_user?: boolean;
    } | null = null;
    let err: string | null = null;
    try {
      profile = await lookupIgsid(senderId, accessToken);
    } catch (e: any) {
      err = e?.message || String(e);
    }

    const username = profile?.username || null;

    contacts.push({
      ig_sender_id: senderId,
      username,
      name: profile?.name || null,
      follower_count: profile?.follower_count ?? null,
      is_verified: profile?.is_verified_user ?? null,
      resolve_error: err,
      channel: s.channel,
      session_id: s.id,
      thread_id: s.thread_id,
      user_msgs: userMsgs.length,
      bot_msgs: botMsgs.length,
      first_msg_at: firstAt,
      last_msg_at: lastAt,
      first_user_msg: firstUser,
      last_user_msg: lastUser,
      ig_link: username ? `https://instagram.com/${username}` : '',
    });

    console.log(
      `  · ${senderId} → ${username ? `@${username}` : `[unresolved: ${err || 'no profile'}]`}`,
    );

    // Be polite to the API
    await new Promise((r) => setTimeout(r, 200));
  }

  // Sort by last message desc
  contacts.sort((a, b) => +new Date(b.last_msg_at) - +new Date(a.last_msg_at));

  // ----- Markdown -----
  const md: string[] = [];
  md.push(`# LDRS Instagram DM — Contact List\n`);
  md.push(
    `**Generated:** ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}  \n` +
      `**Total contacts:** ${contacts.length}  \n` +
      `**Resolved usernames:** ${contacts.filter((c) => c.username).length}/${contacts.length}\n`,
  );
  md.push(`---\n`);
  md.push(
    `| # | Username | Name | Followers | Last msg | Msgs | First user message |`,
  );
  md.push(
    `|---|----------|------|-----------|----------|------|---------------------|`,
  );
  contacts.forEach((c, i) => {
    md.push(
      `| ${i + 1} | ${
        c.username ? `[@${c.username}](${c.ig_link})` : `\`${c.ig_sender_id}\` ${c.resolve_error ? '⚠️' : ''}`
      } | ${c.name || '—'} | ${c.follower_count ?? '—'} | ${fmt(c.last_msg_at)} | ${c.user_msgs}↑ ${c.bot_msgs}↓ | ${clip(c.first_user_msg, 80)} |`,
    );
  });
  md.push('');
  md.push(`---\n`);
  md.push(`## Per-contact details\n`);
  contacts.forEach((c, i) => {
    md.push(`### ${i + 1}. ${c.username ? `@${c.username}` : `(unresolved sender ${c.ig_sender_id})`}`);
    md.push('');
    md.push(`- **Name:** ${c.name || '—'}`);
    if (c.follower_count !== null) md.push(`- **Followers:** ${c.follower_count}`);
    if (c.is_verified !== null) md.push(`- **Verified:** ${c.is_verified ? 'yes ✓' : 'no'}`);
    md.push(`- **Sender ID:** \`${c.ig_sender_id}\``);
    if (c.username) md.push(`- **Profile:** ${c.ig_link}`);
    if (c.resolve_error) md.push(`- **Resolve error:** ${c.resolve_error}`);
    md.push(`- **Channel:** ${c.channel}`);
    md.push(`- **Conversation:** ${c.user_msgs} user msgs / ${c.bot_msgs} bot replies`);
    md.push(`- **First contact:** ${fmt(c.first_msg_at)}`);
    md.push(`- **Last contact:** ${fmt(c.last_msg_at)}`);
    md.push('');
    md.push(`> **First user message:** ${clip(c.first_user_msg, 240) || '—'}`);
    if (c.user_msgs > 1) {
      md.push('>');
      md.push(`> **Last user message:** ${clip(c.last_user_msg, 240)}`);
    }
    md.push('');
  });

  // ----- CSV -----
  const csv: string[] = [];
  csv.push(
    [
      '#',
      'username',
      'name',
      'ig_link',
      'followers',
      'is_verified',
      'last_contact',
      'first_contact',
      'user_msgs',
      'bot_msgs',
      'first_user_msg',
      'last_user_msg',
      'ig_sender_id',
      'session_id',
      'resolve_error',
    ].join(','),
  );
  contacts.forEach((c, i) => {
    csv.push(
      [
        i + 1,
        csvCell(c.username),
        csvCell(c.name),
        csvCell(c.ig_link),
        csvCell(c.follower_count),
        csvCell(c.is_verified),
        csvCell(fmt(c.last_msg_at)),
        csvCell(fmt(c.first_msg_at)),
        c.user_msgs,
        c.bot_msgs,
        csvCell(clip(c.first_user_msg, 200)),
        csvCell(clip(c.last_user_msg, 200)),
        csvCell(c.ig_sender_id),
        csvCell(c.session_id),
        csvCell(c.resolve_error),
      ].join(','),
    );
  });

  writeFileSync(path.join(root, 'ldrs-ig-dm-contacts.md'), md.join('\n'), 'utf8');
  writeFileSync(
    path.join(root, 'ldrs-ig-dm-contacts.json'),
    JSON.stringify(contacts, null, 2),
    'utf8',
  );
  writeFileSync(path.join(root, 'ldrs-ig-dm-contacts.csv'), csv.join('\n'), 'utf8');

  const resolved = contacts.filter((c) => c.username).length;
  console.log(`\n✓ Resolved ${resolved}/${contacts.length} usernames`);
  console.log(`  ${path.join(root, 'ldrs-ig-dm-contacts.md')}`);
  console.log(`  ${path.join(root, 'ldrs-ig-dm-contacts.json')}`);
  console.log(`  ${path.join(root, 'ldrs-ig-dm-contacts.csv')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
