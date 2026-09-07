import { describe, it, expect } from 'vitest';

// formatMetadataForAI is what turns retrieval into prompt text. Two defects lived here for months:
//
//  1. It opened with a fixed "📋 תוכן זמין" preamble, so its output was NEVER empty — and every
//     caller that decided "did we retrieve anything?" by testing the string got `true` for zero
//     hits. cs-context.ts pushes a "--- ידע רלוונטי מהמותג (RAG) ---" section on that basis, so the
//     prompt carried a knowledge header with nothing under it while retrieval was returning 0 for
//     every query on every account. My own e2e check asserted the header and passed on nothing.
//
//  2. It renders by an allow-list of types, so any type it doesn't know is retrieved and then
//     silently dropped. Adding document chunks to search_all_content without this would have
//     retrieved the right answer and thrown it away.
describe('formatMetadataForAI', () => {
  const meta = (over: any = {}) => ({ id: 'i1', type: 'post', title: 'שמן ארגן לשיער יבש', date: '2026-09-01', ...over });

  it('returns an EMPTY string when nothing was retrieved — callers test this to decide if there is knowledge', async () => {
    const { formatMetadataForAI } = await import('@/lib/chatbot/hybrid-retrieval');
    expect(formatMetadataForAI([]).trim()).toBe('');
    // Presence assertion beside it: a function that returned '' for everything would also pass above.
    expect(formatMetadataForAI([meta() as any]).trim()).not.toBe('');
  });

  it('renders document chunks — the site/policy content, where shipping and returns answers live', async () => {
    const { formatMetadataForAI } = await import('@/lib/chatbot/hybrid-retrieval');
    const out = formatMetadataForAI([
      meta({ id: 'd1', type: 'document', title: 'זמני משלוח ARGANIA: המשלוח מגיע עד 10 ימי עסקים' }),
    ] as any);
    expect(out).toContain('10 ימי עסקים');
    expect(out).toContain('d1');
  });

  it('renders every type it is given — nothing retrieved is silently dropped', async () => {
    const { formatMetadataForAI } = await import('@/lib/chatbot/hybrid-retrieval');
    const types = ['post', 'transcription', 'highlight', 'story', 'coupon', 'document'];
    const out = formatMetadataForAI(types.map((t, i) => meta({ id: `id-${t}`, type: t, title: `כותרת ${t}` })) as any);
    for (const t of types) expect(out, `type ${t} was dropped`).toContain(`כותרת ${t}`);
  });
});
