import { describe, it, expect, vi, beforeEach } from 'vitest';

const chat = vi.fn();
vi.mock('@/lib/openai', () => ({ chat, CHAT_MODEL: 'gpt-5-nano' }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/crm/quote-ingest', () => ({ ingestQuote: async () => ({ matched: false }) }));
vi.mock('@/lib/crm/quotes', () => ({ createQuote: vi.fn(), issueQuote: vi.fn(), signUrlFor: (t: string) => `/sign/${t}` }));

const pending = [{ partnershipId: 'p1', clientName: 'אנה', brand: 'קוקה-קולה', subtotal: 80000, total: 94400 }];

describe('interpretConfirmReply', () => {
  beforeEach(() => chat.mockReset());
  it('clear yes without hitting the model', async () => {
    const { interpretConfirmReply } = await import('@/lib/crm/wa-conversation');
    expect(await interpretConfirmReply('כן שלח', pending as any)).toEqual({ decision: 'yes' });
    expect(chat).not.toHaveBeenCalled();
  });
  it('clear no without hitting the model', async () => {
    const { interpretConfirmReply } = await import('@/lib/crm/wa-conversation');
    expect(await interpretConfirmReply('לא, עזוב', pending as any)).toEqual({ decision: 'no' });
    expect(chat).not.toHaveBeenCalled();
  });
  it('a new instruction routes to the model → amend', async () => {
    chat.mockResolvedValue({ response: '{"decision":"amend","reply":null}' });
    const { interpretConfirmReply } = await import('@/lib/crm/wa-conversation');
    const r = await interpretConfirmReply('רגע תשנה לאנה ל-90', pending as any);
    expect(r.decision).toBe('amend');
    expect(chat).toHaveBeenCalledTimes(1);
  });
  it('model unclear → carries a natural re-prompt', async () => {
    chat.mockResolvedValue({ response: '{"decision":"unclear","reply":"לשלוח את ההצעה של אנה?"}' });
    const { interpretConfirmReply } = await import('@/lib/crm/wa-conversation');
    const r = await interpretConfirmReply('אהה', pending as any);
    expect(r.decision).toBe('unclear');
    expect(r.reply).toContain('אנה');
  });
});
