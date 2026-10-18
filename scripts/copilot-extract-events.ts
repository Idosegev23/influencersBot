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
 * each paged with .range() because PostgREST caps a response at 1000 rows,
 * merged and de-duplicated by chunk id.
 */
const PAGE = 1000;
async function loadEventChunks(accountId: string) {
  const byId = new Map<string, any>();
  const filters: Array<(q: any) => any> = [
    (q) => q.eq('topic', 'events'),
    ...URL_HINTS.map((h) => (q: any) => q.ilike('metadata->>url', `%${h}%`)),
  ];
  for (const apply of filters) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await apply(
        sb.from('document_chunks').select('id, chunk_index, chunk_text, metadata, topic').eq('account_id', accountId),
      ).order('chunk_index', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(`chunks: ${error.message}`);
      for (const c of data ?? []) byId.set(c.id, c);
      if (!data || data.length < PAGE) break;
    }
  }
  return [...byId.values()].sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
}

async function main() {
  const accountId = flag('account');
  if (!accountId) throw new Error('--account is required');
  const today = todayIn(flag('tz') || 'America/New_York');
  const dry = flag('dry-run') !== null;
  const runStart = new Date().toISOString();

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
    try {
      const body = parts.join('\n').slice(0, 12000);
      const res = await openai.responses.create({
        model: 'gpt-6-luna', instructions: PROMPT, input: `URL: ${url}\n\n${body}`,
        reasoning: { effort: 'low' }, max_output_tokens: 3000, text: { format: { type: 'json_object' } },
      } as any);
      let parsed: any = null;
      try { parsed = JSON.parse((res as any).output_text || 'null'); } catch { parsed = null; }
      const complete = (res as any).status !== 'incomplete';
      const validJson = parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.events);
      if (!validJson || !complete) console.log(`PARSE_FAIL ${url}`);

      // Same URL + start + title would hit one row twice in a single upsert.
      const unique = new Map<string, ReturnType<typeof parseExtractedEvents>[number]>();
      for (const e of parseExtractedEvents(parsed, url, today)) unique.set(`${e.url}|${e.startsOn}|${e.title}`, e);
      const events = [...unique.values()];
      kept += events.length;
      console.log(`${events.length}  ${url}`);
      if (dry) continue;

      if (events.length > 0) {
        const { error: upErr } = await sb.from('copilot_events').upsert(events.map((e) => ({
          account_id: accountId, title: e.title, starts_on: e.startsOn, ends_on: e.endsOn, location: e.location,
          url: e.url, registration_url: e.registrationUrl, summary: e.summary, source_url: e.sourceUrl, extracted_at: new Date().toISOString(),
        })), { onConflict: 'account_id,url,starts_on,title' });
        if (upErr) throw new Error(`upsert: ${upErr.message}`);
      }
      // Rows this page produced on an earlier run but not this one (moved or removed events).
      if (validJson && complete) {
        const { error: delErr } = await sb.from('copilot_events').delete()
          .eq('account_id', accountId).eq('source_url', url).lt('extracted_at', runStart);
        if (delErr) throw new Error(`stale delete: ${delErr.message}`);
      }
    } catch (e: any) {
      console.log(`FAIL ${url} ${e?.message ?? e}`);
    }
  }

  if (!dry) {
    // Events that have already ended.
    const a = await sb.from('copilot_events').delete().eq('account_id', accountId).is('ends_on', null).lt('starts_on', today);
    if (a.error) console.log(`FAIL past-cleanup ${a.error.message}`);
    const b = await sb.from('copilot_events').delete().eq('account_id', accountId).lt('ends_on', today);
    if (b.error) console.log(`FAIL past-cleanup ${b.error.message}`);
  }
  console.log(`\nupcoming events kept: ${kept}${dry ? ' (dry run, nothing written)' : ''}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
