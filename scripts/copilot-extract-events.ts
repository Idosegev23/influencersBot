/**
 * Extract dated upcoming events from an association's crawled pages into copilot_events.
 *   export PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH
 *   npx tsx scripts/copilot-extract-events.ts --account <uuid> [--tz America/New_York] [--dry-run]
 * Reads document_chunks with topic 'events' or an event-like URL, groups by URL,
 * asks the model for structured events, keeps only future ones, upserts.
 */
import { config as loadEnv } from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { parseExtractedEvents, todayIn } from '../src/lib/copilot/events-store';

loadEnv({ path: '.env.local' });
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '') : null; };
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `Extract every specific, dated event (conference, marketplace, expo, webinar, meeting, summit) from the page text.
Return JSON {"events":[{"title":string,"starts_on":"YYYY-MM-DD","ends_on":"YYYY-MM-DD"|null,"location":string|null,"url":string|null,"registration_url":string|null,"summary":string|null}]}.
Only include an event when the page states its date. Use the year shown on the page; if no year is shown, omit the event. Never guess.`;

const URL_HINTS = ['event', 'marketplace', 'webinar'];

/**
 * Chunks on event topics or event-like URLs. Separate queries (not one
 * PostgREST .or() with JSON-path filters, whose parsing is unreliable),
 * merged and de-duplicated by chunk id.
 */
async function loadEventChunks(accountId: string) {
  const base = () => sb.from('document_chunks')
    .select('id, chunk_text, metadata, topic')
    .eq('account_id', accountId)
    .limit(2000);
  const results = await Promise.all([
    base().eq('topic', 'events'),
    ...URL_HINTS.map((h) => base().ilike('metadata->>url', `%${h}%`)),
  ]);
  const byId = new Map<string, any>();
  for (const r of results) {
    if (r.error) throw new Error(`chunks: ${r.error.message}`);
    for (const c of r.data ?? []) byId.set((c as any).id, c);
  }
  return [...byId.values()];
}

async function main() {
  const accountId = flag('account');
  if (!accountId) throw new Error('--account is required');
  const today = todayIn(flag('tz') || 'America/New_York');
  const dry = flag('dry-run') !== null;

  const chunks = await loadEventChunks(accountId);

  const pages = new Map<string, string[]>();
  for (const c of chunks) {
    const url = c.metadata?.url;
    if (typeof url !== 'string') continue;
    pages.set(url, [...(pages.get(url) ?? []), c.chunk_text ?? '']);
  }
  console.log(`pages: ${pages.size}, today: ${today}`);

  let kept = 0;
  for (const [url, parts] of pages) {
    const body = parts.join('\n').slice(0, 12000);
    const res = await openai.responses.create({
      model: 'gpt-6-luna', instructions: PROMPT, input: `URL: ${url}\n\n${body}`,
      reasoning: { effort: 'low' }, max_output_tokens: 1500, text: { format: { type: 'json_object' } },
    } as any);
    let parsed: unknown = null;
    try { parsed = JSON.parse((res as any).output_text || 'null'); } catch { parsed = null; }
    const events = parseExtractedEvents(parsed, url, today);
    kept += events.length;
    console.log(`${events.length}  ${url}`);
    if (dry || events.length === 0) continue;
    const { error: upErr } = await sb.from('copilot_events').upsert(events.map((e) => ({
      account_id: accountId, title: e.title, starts_on: e.startsOn, ends_on: e.endsOn, location: e.location,
      url: e.url, registration_url: e.registrationUrl, summary: e.summary, source_url: e.sourceUrl, extracted_at: new Date().toISOString(),
    })), { onConflict: 'account_id,url,starts_on' });
    if (upErr) throw new Error(`upsert: ${upErr.message}`);
  }
  console.log(`\nupcoming events kept: ${kept}${dry ? ' (dry run, nothing written)' : ''}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
