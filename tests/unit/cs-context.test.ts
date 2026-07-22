import { describe, it, expect, vi, beforeEach } from 'vitest';

const buildPersonalityFromDB = vi.fn().mockResolvedValue({ signatureStyle: 'warm', commonPhrases: ['היי'], emojiUsage: 'minimal', boundaries: [] });
vi.mock('@/lib/chatbot/personality-wrapper', () => ({ buildPersonalityFromDB: (...a: any[]) => buildPersonalityFromDB(...a) }));
const searchContentByQuery = vi.fn().mockResolvedValue([{ id: 'x' }]);
const formatMetadataForAI = vi.fn().mockReturnValue('שמן ארגן — 100 מ״ל, לשיער יבש');
vi.mock('@/lib/chatbot/hybrid-retrieval', () => ({
  searchContentByQuery: (...a: any[]) => searchContentByQuery(...a),
  formatMetadataForAI: (...a: any[]) => formatMetadataForAI(...a),
}));

// CS-enabled brands the unbound prompt should inject (brain-led matching, task C5). Also backs the
// single-row account lookup buildContextDigest would use for boundBrand (unused by these tests, but
// harmless to keep working).
const ENABLED_ROWS = [
  { id: 'acc-argania', config: { username: 'argania', display_name: 'Argania', whatsapp_cs: { enabled: true }, widget: { domain: 'argania-oil.co.il' } } },
  { id: 'acc-labeaute', config: { username: 'labeaute', display_name: 'LA BEAUTÉ', whatsapp_cs: { enabled: true }, domain: 'labeaute.co.il' } },
];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.filter = () => ctx;
      ctx.single = async () => ({ data: { config: { display_name: 'Argania' } } });
      ctx.then = (resolve: any) => resolve({ data: ENABLED_ROWS, error: null });
      return ctx;
    },
  },
}));

const digest = (over: any = {}) => ({ knownName: null, boundBrand: null, warm: false, openThreads: [], recentTurns: [], ...over });

describe('cs-context', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stripSuggestions removes the <<SUGGESTIONS>> envelope', async () => {
    const { stripSuggestions } = await import('@/lib/cs/cs-context');
    expect(stripSuggestions('שלום\n<<SUGGESTIONS>>a|b<</SUGGESTIONS>>')).toBe('שלום');
  });

  it('unbound prompt: asks for a brand, injects NO RAG', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: null, userMessage: 'היי', digest: digest() });
    expect(p).toMatch(/resolve_brand/);
    expect(p).toMatch(/מותג/);
    expect(searchContentByQuery).not.toHaveBeenCalled();
    expect(buildPersonalityFromDB).not.toHaveBeenCalled();
  });

  // (b) Brain-led contract: the unbound prompt lists the CS-enabled roster directly (name + domain)
  // so the LLM can match "ארגן"→Argania etc. straight from context, not just via the resolve_brand tool.
  it('unbound prompt: includes the CS-enabled brands (name + domain) for direct brain matching', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: null, userMessage: 'היי, יש לכם שמן ארגן?', digest: digest() });
    expect(p).toContain('Argania');
    expect(p).toContain('argania-oil.co.il');
    expect(p).toContain('LA BEAUTÉ');
    expect(p).toContain('labeaute.co.il');
  });

  it('bound prompt: injects brand persona + RAG (searchContentByQuery scoped to the account)', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: 'acc-1', userMessage: 'איך משתמשים בשמן?', digest: digest({ boundBrand: 'Argania' }) });
    expect(searchContentByQuery).toHaveBeenCalledWith('acc-1', 'איך משתמשים בשמן?');
    expect(buildPersonalityFromDB).toHaveBeenCalledWith('acc-1');
    expect(p).toContain('שמן ארגן'); // RAG snippet injected
  });

  it('pre-bind prompt: recentTurns from context.recentTurns are included for onboarding continuity', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({
      accountId: null,
      userMessage: 'כן, זה המותג',
      digest: digest({ recentTurns: [
        { role: 'user', text: 'קוראים לי דנה, אני מחפשת את ארגניה' },
        { role: 'assistant', text: 'מצאתי את Argania — לאשר?' },
      ] }),
    });
    expect(p).toContain('קוראים לי דנה, אני מחפשת את ארגניה');
    expect(p).toContain('מצאתי את Argania — לאשר?');
  });

  it('digest drives greeting/re-entry hints (known name, warm, ≥2 threads → show_list)', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: null, userMessage: 'היי', digest: digest({ knownName: 'דנה', warm: true, openThreads: [{ ticketId: 't1', brand: 'Argania', topic: 'x' }, { ticketId: 't2', brand: 'LA BEAUTÉ', topic: 'y' }] }) });
    expect(p).toContain('דנה');
    expect(p).toMatch(/חמה|warm|45/);
    expect(p).toMatch(/show_list/);
  });
});
