import { describe, it, expect, vi } from 'vitest';
import { classifySession, CLASSIFY_MODEL, RETRY_MODEL } from '@/lib/conversation-analytics/classify';
import { buildProductIndex, type CatalogProduct } from '@/lib/conversation-analytics/product-resolver';

const CATALOG: CatalogProduct[] = [
  { id: 'p1', name: 'Argan Oil Shampoo', name_he: 'שמפו שמן ארגן', slug: 'argan-oil-shampoo', category: 'hair_care' },
];
const index = buildProductIndex(CATALOG);

const SESSION = {
  id: 's1',
  accountId: 'a1',
  channel: 'web',
  startedAt: '2026-08-20T10:00:00.000Z',
  messages: [
    { role: 'user', content: 'קיבלתי שמפו שמן ארגן פגום, הבקבוק דלף' },
    { role: 'assistant', content: 'מצטערת לשמוע, אעביר לשירות הלקוחות' },
  ],
  intentHints: [],
};

const USAGE = { input_tokens: 1200, cached_input_tokens: 1000, output_tokens: 120 };

function modelReturning(json: any, usage = USAGE) {
  return vi.fn(async () => ({ json, usage }));
}

const GOOD = {
  inquiry_type: 'complaint',
  topic: 'בקבוק שמפו דלף',
  is_complaint: true,
  complaint_kind: 'defective',
  sentiment: 'negative',
  urgency: 'high',
  outcome: 'escalated',
  product_mention: 'שמפו שמן ארגן',
  keywords: ['פגום', 'דליפה'],
  summary: 'לקוחה קיבלה בקבוק שמפו דלוף וביקשה החלפה',
  confidence: 0.93,
};

describe('buildClassifyPrompt', () => {
  // A hand-check of 20 real classifications found one systematic miss: a session
  // opening with "מה מתאים לשיער יבש?" and closing with "אתה איש?" was labelled
  // `other`, following the last turn instead of the reason the customer came.
  it('tells the model to classify by the reason the customer came, not the last turn', async () => {
    const { buildClassifyPrompt } = await import('@/lib/conversation-analytics/classify');
    const prompt = buildClassifyPrompt('- מוצר');
    expect(prompt).toContain('לא את המשפט האחרון');
    expect(prompt).toContain('גוברת');
  });
});

describe('classifySession', () => {
  it('maps a clean model answer onto a storable row', async () => {
    const callModel = modelReturning(GOOD);
    const row = await classifySession(SESSION, index, { callModel });

    expect(row.session_id).toBe('s1');
    expect(row.account_id).toBe('a1');
    expect(row.channel).toBe('web');
    expect(row.inquiry_type).toBe('complaint');
    expect(row.topic_raw).toBe('בקבוק שמפו דלף');
    expect(row.is_complaint).toBe(true);
    expect(row.complaint_kind).toBe('defective');
    expect(row.product_id).toBe('p1');
    expect(row.product_category).toBe('hair_care');
    expect(row.product_mention_raw).toBe('שמפו שמן ארגן');
    expect(row.keywords).toEqual(['פגום', 'דליפה']);
    expect(row.status).toBe('ok');
    expect(row.user_message_count).toBe(1);
    expect(row.model).toBe(CLASSIFY_MODEL);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('prices the call using cached input tokens', async () => {
    const row = await classifySession(SESSION, index, { callModel: modelReturning(GOOD) });
    // 200 uncached @ $0.20/M + 1000 cached @ $0.02/M + 120 out @ $1.20/M
    expect(row.cost_usd).toBeCloseTo(0.000204, 8);
    expect(row.tokens_in).toBe(1200);
    expect(row.tokens_out).toBe(120);
  });

  // A hallucinated category would violate the CHECK constraint and lose the row.
  it('coerces an out-of-enum inquiry type to other', async () => {
    const row = await classifySession(SESSION, index, {
      callModel: modelReturning({ ...GOOD, inquiry_type: 'shipping_delay' }),
    });
    expect(row.inquiry_type).toBe('other');
  });

  it('leaves the product unresolved rather than guessing a neighbour', async () => {
    const row = await classifySession(SESSION, index, {
      callModel: modelReturning({ ...GOOD, product_mention: 'שמפו ארגן' }),
    });
    expect(row.product_id).toBeNull();
    expect(row.product_category).toBeNull();
    expect(row.product_mention_raw).toBe('שמפו ארגן'); // what the customer said is kept
  });

  it('retries once on the stronger model when confidence is below the floor', async () => {
    const callModel = vi.fn()
      .mockResolvedValueOnce({ json: { ...GOOD, confidence: 0.4 }, usage: USAGE })
      .mockResolvedValueOnce({ json: { ...GOOD, confidence: 0.88 }, usage: USAGE });

    const row = await classifySession(SESSION, index, { callModel });

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0].model).toBe(CLASSIFY_MODEL);
    expect(callModel.mock.calls[1][0].model).toBe(RETRY_MODEL);
    expect(row.model).toBe(RETRY_MODEL);
    expect(row.status).toBe('ok');
  });

  it('marks needs_review when even the retry stays unconfident', async () => {
    const callModel = vi.fn(async () => ({ json: { ...GOOD, confidence: 0.3 }, usage: USAGE }));
    const row = await classifySession(SESSION, index, { callModel });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('needs_review');
  });

  it('records a failed row instead of throwing when the model errors', async () => {
    const callModel = vi.fn(async () => { throw new Error('429 rate limited'); });
    const row = await classifySession(SESSION, index, { callModel });
    expect(row.status).toBe('failed');
    expect(row.error_message).toContain('429');
    expect(row.inquiry_type).toBeNull();
  });
});
