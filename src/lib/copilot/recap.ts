/**
 * The visitor's copy of their conversation with the association assistant.
 * English only; every value from the conversation is escaped.
 */
import crypto from 'node:crypto';
import { escapeHtml as esc } from './escalate';

export interface RecapLink { title: string; url: string }
export interface RecapMessage { role: string; content: string; metadata?: any }

const MAX_LINKS = 20;

/** Recipient fingerprint stored on recap_sent events instead of the address. */
export const recipientHash = (email: string) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

function httpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Links an assistant message carries in metadata.copilot (objects with a url; bare source numbers are skipped). */
export function citedLinksFrom(messages: RecapMessage[]): RecapLink[] {
  const out: RecapLink[] = [];
  for (const m of messages) {
    if (m?.role !== 'assistant') continue;
    const cp = m.metadata?.copilot;
    if (!cp) continue;
    for (const list of [cp.sources, cp.cited]) {
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        if (s && typeof s === 'object' && typeof s.url === 'string') {
          out.push({ title: typeof s.title === 'string' ? s.title : s.url, url: s.url });
        }
      }
    }
  }
  return out;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

export function buildRecapEmail(p: { associationName: string; messages: RecapMessage[]; sources: RecapLink[] }): { subject: string; html: string } {
  const name = oneLine(p.associationName) || 'association';
  const seen = new Set<string>();
  const links: RecapLink[] = [];
  for (const s of [...(p.sources ?? []), ...citedLinksFrom(p.messages ?? [])]) {
    const url = httpUrl(s?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({ title: oneLine(typeof s.title === 'string' && s.title.trim() ? s.title : url), url });
    if (links.length >= MAX_LINKS) break;
  }

  const turns = (p.messages ?? [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => `<p><b>${m.role === 'user' ? 'You' : 'Assistant'}:</b> ${esc(m.content.trim()).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
  const linkList = links.length
    ? `<hr><p><b>Links from this conversation</b></p><ul>${links.map((l) => `<li><a href="${esc(l.url)}">${esc(l.title)}</a></li>`).join('')}</ul>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><p>Here is a copy of your conversation with the ${esc(name)} assistant.</p><hr>${turns}${linkList}<hr><p style="color:#666;font-size:12px">You received this email because you asked for a copy of your conversation.</p></div>`;
  return { subject: `Your conversation with the ${name} assistant`, html };
}
