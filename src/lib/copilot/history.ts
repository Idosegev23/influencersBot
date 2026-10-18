/**
 * A visitor's own transcript, for redrawing a resumed chat: the last messages
 * of the session with the cards each answer showed, as stored by the turn in
 * chat_messages.metadata.copilot. Stored cards were checked when the turn ran;
 * they are re-checked here so a malformed or older row can never put a bad
 * link on the page.
 */
import { supabase } from '@/lib/supabase';

export const RESUME_MESSAGE_LIMIT = 30;

const isWebUrl = (v: unknown): v is string => typeof v === 'string' && v.length <= 2000 && /^https?:\/\//i.test(v);
const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.length <= max ? v : null);

export function cleanSources(raw: unknown): Array<{ n: number; title: string; url: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x: any) => x && Number.isInteger(x.n) && typeof x.title === 'string' && isWebUrl(x.url))
    .slice(0, 10)
    .map((x: any) => ({ n: x.n, title: x.title, url: x.url }));
}

export interface StoredCards {
  sources: Array<{ n: number; title: string; url: string }>;
  related: { title: string; url: string } | null;
  event: { id: string; title: string; startsOn: string; endsOn: string | null; location: string | null; url: string; registrationUrl: string | null } | null;
  cta: { kind: 'event' | 'join' | 'renew'; url: string } | null;
}

export function cardsOf(metadata: unknown): StoredCards {
  const c = ((metadata as any)?.copilot ?? {}) as any;
  const r = c.related;
  const related = r && typeof r === 'object' && typeof r.title === 'string' && isWebUrl(r.url) ? { title: r.title, url: r.url } : null;
  const e = c.event;
  const event = e && typeof e === 'object' && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.startsOn === 'string' && isWebUrl(e.url)
    ? {
      id: e.id, title: e.title, startsOn: e.startsOn,
      endsOn: str(e.endsOn, 40), location: str(e.location),
      url: e.url, registrationUrl: isWebUrl(e.registrationUrl) ? e.registrationUrl : null,
    }
    : null;
  const k = c.cta;
  const cta = k && typeof k === 'object' && ['event', 'join', 'renew'].includes(k.kind) && isWebUrl(k.url) ? { kind: k.kind, url: k.url } : null;
  return { sources: cleanSources(c.sources), related, event, cta };
}

export type HistoryMessage =
  | { role: 'user'; content: string; cards: null }
  | { role: 'assistant'; content: string; cards: StoredCards };

/** Last RESUME_MESSAGE_LIMIT user/assistant messages, oldest first. [] on a read failure (the chat still opens). */
export async function loadSessionHistory(sessionId: string, db: any = supabase): Promise<HistoryMessage[]> {
  try {
    const { data, error } = await db.from('chat_messages').select('role, content, metadata, created_at')
      .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(RESUME_MESSAGE_LIMIT);
    if (error) { console.error('[copilot/history]', 'read failed', error.message); return []; }
    return ((data ?? []) as any[])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .reverse()
      .map((m) => (m.role === 'user'
        ? { role: 'user' as const, content: m.content, cards: null }
        : { role: 'assistant' as const, content: m.content, cards: cardsOf(m.metadata) }));
  } catch (e) {
    console.error('[copilot/history]', 'read threw', e);
    return [];
  }
}
