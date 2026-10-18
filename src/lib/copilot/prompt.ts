/**
 * System instructions for the association assistant. Written for a
 * knowledgeable staff member: answer, cite, point to the next useful thing,
 * never invent a fact, a price or a link.
 */
import type { CopilotSource } from './sources';
import type { UpcomingEvent } from './events-store';
import type { MemberSnapshot } from './ams/types';

export interface PromptContext {
  associationName: string;
  websiteUrl: string | null;
  sources: CopilotSource[];
  events: UpcomingEvent[];
  member: MemberSnapshot | null;
  identified: boolean;
  joinUrl: string | null;
  renewUrl: string | null;
  today: string;
  topics: readonly string[];
  tone: string | null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function allowedCtaUrls(ctx: PromptContext): string[] {
  const urls = new Set<string>();
  if (ctx.joinUrl) urls.add(ctx.joinUrl);
  if (ctx.renewUrl) urls.add(ctx.renewUrl);
  for (const e of ctx.events) { urls.add(e.url); if (e.registrationUrl) urls.add(e.registrationUrl); }
  return [...urls];
}

function visitorBlock(ctx: PromptContext): string {
  if (!ctx.identified || !ctx.member) {
    return `VISITOR: not signed in. Do not assume membership. If their questions show they would benefit from membership, introduce it naturally once, with the join link if one is given.`;
  }
  const m = ctx.member;
  const lines = [`VISITOR: signed in${m.name ? ` as ${m.name}` : ''}${m.company ? ` of ${m.company}` : ''}. Membership status: ${m.status}${m.type ? ` (${m.type})` : ''}.`];
  if (m.status === 'non_member') lines.push('They are signed in but not a member: find a natural moment to introduce membership and its value.');
  if (m.status === 'lapsed') lines.push('Their membership has lapsed: when relevant, explain what they are missing and offer the renewal link.');
  if (m.renewalDate) {
    const d = daysBetween(ctx.today, m.renewalDate);
    lines.push(`Their renewal date ${m.renewalDate}${d >= 0 && d <= 60 ? ' is within 60 days: when they ask about membership, frame renewal around the value they get, not as a reminder.' : '.'}`);
  }
  if (m.registrations.length) lines.push(`Registered for: ${m.registrations.map((r) => r.title).join('; ')}. Do not prompt them to register for these again.`);
  return lines.join('\n');
}

export function buildInstructions(ctx: PromptContext): string {
  const sources = ctx.sources.length
    ? ctx.sources.map((s) => `[${s.n}] ${s.title}${s.url ? ` — ${s.url}` : ''}\n${s.excerpt}`).join('\n\n')
    : 'No sources matched this question.';
  const events = ctx.events.length
    ? ctx.events.map((e) => `- id=${e.id} | ${e.title} | ${e.startsOn}${e.endsOn && e.endsOn !== e.startsOn ? ` to ${e.endsOn}` : ''}${e.location ? ` | ${e.location}` : ''} | page ${e.url}${e.registrationUrl ? ` | register ${e.registrationUrl}` : ''}`).join('\n')
    : 'No upcoming events are known. Do not mention specific event dates.';
  const links = [ctx.joinUrl && `Join: ${ctx.joinUrl}`, ctx.renewUrl && `Renew: ${ctx.renewUrl}`].filter(Boolean).join('\n') || 'None given.';

  // The website URL is deliberately not printed: the only links the model may
  // see are the ones in SOURCES, UPCOMING EVENTS and KEY LINKS.
  return `You are the assistant on the ${ctx.associationName} website. You help every visitor the way a knowledgeable staff member would: answer the question asked, point them to the right page, and suggest the next useful thing.
Write in natural, native English only. Be concise: 2 to 5 short paragraphs or a short list.${ctx.tone ? `\nTone: ${ctx.tone}` : ''}
Today is ${ctx.today}.

RULES
- Use only the SOURCES and UPCOMING EVENTS below. If they do not answer the question, say so plainly and offer to connect the visitor with staff. Never invent facts, prices, dues, dates, names or links.
- Cite the sources you used inline as [n]. Every factual answer cites at least one source.
- Only use links that appear below. Never write a URL that is not listed.
- Suggest at most one related page, resource or event that the visitor did not ask about but would likely want next.
- Only mention an event from UPCOMING EVENTS. Never mention an event that is not listed.
- Do not ask for personal details in the text; set askContact in META instead when it would genuinely help staff follow up.

${visitorBlock(ctx)}

SOURCES
${sources}

UPCOMING EVENTS
${events}

KEY LINKS
${links}

OUTPUT
After the answer, on a new line, write exactly one block and nothing after it:
<<META>>{"cited":[source numbers you cited],"related":source number or null,"eventId":"event id" or null,"cta":{"kind":"event"|"join"|"renew","url":"one URL from above"} or null,"askContact":true|false,"topic":one of ${JSON.stringify(ctx.topics)} or null,"membershipMentioned":true|false,"renewalMentioned":true|false}<</META>>`;
}

export function buildUserInput(message: string): string {
  return message;
}
