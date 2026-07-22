import { describe, it, expect, vi, beforeEach } from 'vitest';

const buildPersonalityFromDB = vi.fn().mockResolvedValue({ signatureStyle: 'warm', commonPhrases: ['היי'], emojiUsage: 'minimal', boundaries: [] });
vi.mock('@/lib/chatbot/personality-wrapper', () => ({ buildPersonalityFromDB: (...a: any[]) => buildPersonalityFromDB(...a) }));
const searchContentByQuery = vi.fn().mockResolvedValue([{ id: 'x' }]);
const formatMetadataForAI = vi.fn().mockReturnValue('שמן ארגן — 100 מ״ל, לשיער יבש');
vi.mock('@/lib/chatbot/hybrid-retrieval', () => ({
  searchContentByQuery: (...a: any[]) => searchContentByQuery(...a),
  formatMetadataForAI: (...a: any[]) => formatMetadataForAI(...a),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: { display_name: 'Argania' } } }) }) }) }) },
}));

const digest = (over: any = {}) => ({ knownName: null, boundBrand: null, warm: false, openThreads: [], ...over });

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

  it('bound prompt: injects brand persona + RAG (searchContentByQuery scoped to the account)', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: 'acc-1', userMessage: 'איך משתמשים בשמן?', digest: digest({ boundBrand: 'Argania' }) });
    expect(searchContentByQuery).toHaveBeenCalledWith('acc-1', 'איך משתמשים בשמן?');
    expect(buildPersonalityFromDB).toHaveBeenCalledWith('acc-1');
    expect(p).toContain('שמן ארגן'); // RAG snippet injected
  });

  it('digest drives greeting/re-entry hints (known name, warm, ≥2 threads → show_list)', async () => {
    const { buildCsSystemPrompt } = await import('@/lib/cs/cs-context');
    const p = await buildCsSystemPrompt({ accountId: null, userMessage: 'היי', digest: digest({ knownName: 'דנה', warm: true, openThreads: [{ ticketId: 't1', brand: 'Argania', topic: 'x' }, { ticketId: 't2', brand: 'LA BEAUTÉ', topic: 'y' }] }) });
    expect(p).toContain('דנה');
    expect(p).toMatch(/חמה|warm|45/);
    expect(p).toMatch(/show_list/);
  });
});
