/**
 * Getting demo activity in front of the sales team.
 *
 * Two channels, split by what each is good at:
 *
 *  - WhatsApp carries MOMENTS. Short, immediate, and only for things worth
 *    interrupting someone over: the demo was opened, somebody is really talking
 *    to it, the window closed. Reaches the three team members whose numbers are
 *    verified (Kfir, Ido, Yoav) via the same `SCAN_NOTIFY_RECIPIENTS` list the
 *    scan-complete notifications already use.
 *  - Email carries DEPTH. Full transcripts, counters, everything. Reaches all
 *    five of SALES_RECIPIENTS.
 *
 * The split is not cosmetic: a WhatsApp template body cannot hold a transcript,
 * and a daily email cannot tell you a prospect is on the page right now.
 */

import { sendTemplate } from '@/lib/whatsapp-cloud/client';
import { getBestieChannel } from '@/lib/whatsapp-cloud/channels';
import { parseRecipients } from '@/lib/pipeline/notify-helpers';

/** Meta rejects body params containing newlines/tabs/4+ spaces (error 132018). */
export function sanitizeParam(s: string): string {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, ' ').trim();
}

/**
 * Fire one short WhatsApp to the team.
 *
 * Best-effort per recipient: one bad number must not stop the rest. Returns the
 * number of confirmed sends so callers can decide whether to stamp state — a
 * stamp written after a failed send silently skips that demo's whole funnel,
 * the bug already learned from in bestie-lead-nudge.
 */
export async function notifyDemoTeamWhatsApp(text: string): Promise<number> {
  const recipients = parseRecipients(process.env.SCAN_NOTIFY_RECIPIENTS);
  let sent = 0;

  // getBestieChannel throws when BESTIE_ACCOUNT_ID is unset. Report zero sends
  // rather than propagating: callers use the count to decide whether to stamp
  // state, and a missing env should postpone the notification, not break the
  // cron sweep or the lead submission that triggered it.
  let channel;
  try {
    channel = await getBestieChannel();
  } catch (err: any) {
    console.error('[demo-notify] no Bestie WhatsApp channel:', err?.message || err);
    return 0;
  }

  for (const to of recipients) {
    try {
      const res = await sendTemplate({
        channel,
        to,
        templateName: 'support_freeform_message',
        languageCode: 'he',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: sanitizeParam('צוות') },
              { type: 'text', text: sanitizeParam('Bestie') },
              { type: 'text', text: sanitizeParam(text) },
            ],
          },
        ],
      });
      if (res.success) sent++;
    } catch (err: any) {
      console.error('[demo-notify] WhatsApp send failed:', to, err?.message || err);
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

export interface TranscriptTurn {
  role: string;
  content: string;
  at: string;
}

export interface DemoSessionTranscript {
  sessionId: string;
  startedAt: string;
  turns: TranscriptTurn[];
}

export interface DemoUsage {
  sessions: number;
  userMessages: number;
  totalMessages: number;
  transcripts: DemoSessionTranscript[];
}

const MAX_SESSIONS = 25;
const MAX_TURNS_PER_SESSION = 60;

/**
 * Sessions and messages for one demo account since `sinceIso`.
 *
 * Bounded on purpose (25 sessions × 60 turns): this feeds an email, and an
 * enthusiastic prospect should not be able to produce a message nobody can
 * open. `truncated` on the result tells the caller to say so rather than
 * quietly presenting a partial picture as complete.
 */
export async function loadDemoUsage(
  supabase: { from: (t: string) => any },
  accountId: string,
  sinceIso: string,
): Promise<DemoUsage & { truncated: boolean }> {
  const empty = { sessions: 0, userMessages: 0, totalMessages: 0, transcripts: [], truncated: false };

  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, created_at')
    .eq('account_id', accountId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(MAX_SESSIONS + 1);

  if (!sessions?.length) return empty;

  const truncated = sessions.length > MAX_SESSIONS;
  const page = sessions.slice(0, MAX_SESSIONS);

  const { data: rows } = await supabase
    .from('chat_messages')
    .select('session_id, role, content, created_at')
    .in('session_id', page.map((s: any) => s.id))
    .order('created_at', { ascending: true });

  const bySession = new Map<string, TranscriptTurn[]>();
  let userMessages = 0;
  for (const m of rows || []) {
    if (m.role === 'user') userMessages++;
    const list = bySession.get(m.session_id) || [];
    if (list.length < MAX_TURNS_PER_SESSION) {
      list.push({ role: m.role, content: String(m.content ?? ''), at: m.created_at });
    }
    bySession.set(m.session_id, list);
  }

  const transcripts: DemoSessionTranscript[] = page
    .map((s: any) => ({
      sessionId: s.id,
      startedAt: s.created_at,
      turns: bySession.get(s.id) || [],
    }))
    // A session row with no messages is a page load, counted below but not
    // worth a transcript block.
    .filter((t) => t.turns.length > 0);

  return {
    sessions: page.length,
    userMessages,
    totalMessages: (rows || []).length,
    transcripts,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

/** Everything below is written by a stranger, so nothing goes in unescaped. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ilTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  } catch {
    return iso;
  }
}

/** One demo's transcripts as HTML blocks — shared by the digest and the lead email. */
export function transcriptsHtml(transcripts: DemoSessionTranscript[]): string {
  if (!transcripts.length) {
    return '<p style="color:#666">אין שיחות בטווח הזה.</p>';
  }
  return transcripts
    .map((t) => {
      const turns = t.turns
        .map((turn) => {
          const isUser = turn.role === 'user';
          const who = isUser ? 'המתעניין' : 'בסטי';
          const bg = isUser ? '#f3f4f6' : '#f5edfe';
          return (
            `<div style="margin:6px 0;padding:9px 11px;background:${bg};border-radius:8px">` +
            `<div style="font-size:11px;color:#888;margin-bottom:3px">${who}</div>` +
            `<div style="white-space:pre-wrap">${esc(turn.content)}</div>` +
            `</div>`
          );
        })
        .join('');
      return (
        `<div style="margin:14px 0;padding:12px;border:1px solid #eee;border-radius:10px">` +
        `<div style="font-size:12px;color:#666;margin-bottom:8px">שיחה מ-${esc(ilTime(t.startedAt))}</div>` +
        turns +
        `</div>`
      );
    })
    .join('');
}
