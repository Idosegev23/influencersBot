/**
 * Re-read the knowledge links a customer marked as changing.
 *
 * When someone adds a link they answer one question: does this page change?
 * Saying yes sets `refresh_daily`, and this job is the whole of what that
 * answer buys them.
 *
 * It is deliberately NOT part of `daily-scan`. That cron skips demo accounts
 * and requires a connected Instagram handle, so accounts that have links to
 * refresh but no Instagram — an association, a demo being evaluated — would
 * silently never see their links updated.
 *
 * A page that fails to load keeps its previous content. Losing today's answer
 * because a site was briefly down is worse than answering from yesterday's copy,
 * so failures are recorded on the row and the old content stays live.
 *
 * Auth: Bearer `CRON_SECRET`.
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" ".../api/cron/refresh-knowledge-links?account_id=<uuid>"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readLink, indexKnowledgeEntry } from '@/lib/knowledge/link-ingest';

export const maxDuration = 300;

/** Bounded so one run cannot outlive the function; the rest are picked up tomorrow. */
const MAX_LINKS_PER_RUN = 60;

function authorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const accountFilter = req.nextUrl.searchParams.get('account_id');

  let query = supabase
    .from('chatbot_knowledge_base')
    .select('id, account_id, title, knowledge_type, source_url, last_fetched_at')
    .eq('refresh_daily', true)
    .eq('is_active', true)
    .not('source_url', 'is', null)
    // Oldest first, so a backlog drains fairly instead of the same rows winning
    // every night. nullsFirst covers a link that has somehow never been read.
    .order('last_fetched_at', { ascending: true, nullsFirst: true })
    .limit(MAX_LINKS_PER_RUN);

  if (accountFilter) query = query.eq('account_id', accountFilter);

  const { data: links, error } = await query;
  if (error) {
    console.error('[refresh-links] query failed:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!links?.length) {
    return NextResponse.json({ checked: 0, updated: 0, unchanged: 0, failed: 0 });
  }

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const link of links) {
    const read = await readLink(link.source_url as string);

    if (!read.ok) {
      failed++;
      await supabase
        .from('chatbot_knowledge_base')
        .update({ fetch_error: (read.error || 'unknown').slice(0, 300), last_fetched_at: new Date().toISOString() })
        .eq('id', link.id);
      continue;
    }

    // Only re-index when the page actually differs. Embedding an unchanged page
    // every night would spend the account's budget to rewrite identical chunks.
    const { data: current } = await supabase
      .from('chatbot_knowledge_base')
      .select('content')
      .eq('id', link.id)
      .maybeSingle();

    if (current?.content === read.content) {
      unchanged++;
      await supabase
        .from('chatbot_knowledge_base')
        .update({ last_fetched_at: new Date().toISOString(), fetch_error: null })
        .eq('id', link.id);
      continue;
    }

    await supabase
      .from('chatbot_knowledge_base')
      .update({
        content: read.content,
        last_fetched_at: new Date().toISOString(),
        fetch_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.id);

    await indexKnowledgeEntry({
      accountId: link.account_id as string,
      entryId: link.id as string,
      title: (link.title as string) || read.title,
      content: read.content,
      knowledgeType: (link.knowledge_type as string) || 'link',
      sourceUrl: link.source_url as string,
    });
    updated++;
  }

  console.log(`[refresh-links] checked ${links.length}: ${updated} updated, ${unchanged} unchanged, ${failed} failed`);
  return NextResponse.json({ checked: links.length, updated, unchanged, failed });
}
