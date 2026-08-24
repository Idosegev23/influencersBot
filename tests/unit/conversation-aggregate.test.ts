import { describe, it, expect } from 'vitest';
import { buildReport, type ClassificationLite } from '@/lib/conversation-analytics/aggregate';

let n = 0;
const row = (o: Partial<ClassificationLite>): ClassificationLite => ({
  session_id: `s${n++}`,
  channel: 'web',
  started_at: '2026-08-20T10:00:00.000Z',
  inquiry_type: 'product_question',
  topic_label: 'נושא',
  is_complaint: false,
  complaint_kind: null,
  sentiment: 'neutral',
  outcome: 'resolved_by_bot',
  product_id: null,
  product_name: null,
  product_category: null,
  product_line: null,
  keywords: [],
  status: 'ok',
  ...o,
});

describe('coverage', () => {
  // 17 of 936 tickets carry a product today. Without this number on screen a
  // partial sample reads as a complete one.
  it('excludes needs_review and failed rows from the classified numerator', () => {
    const r = buildReport({
      current: [row({}), row({ status: 'needs_review' }), row({ status: 'failed' })],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.coverage.total).toBe(3);
    expect(r.coverage.classified).toBe(1);
    expect(r.coverage.classifiedPct).toBe(33);
  });

  it('reports product attribution as a share of complaints only', () => {
    const r = buildReport({
      current: [
        row({ is_complaint: true, product_id: 'p1', product_name: 'שמפו' }),
        row({ is_complaint: true, product_id: null }),
        row({ is_complaint: false, product_id: 'p1', product_name: 'שמפו' }),
      ],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.coverage.complaintsWithProductPct).toBe(50);
  });

  // The bug this guards: coverage used to divide by the number of
  // classification rows present, so a run that had only reached 3% of the
  // account's sessions still displayed 100% classified. Coverage must be
  // measured against the sessions that exist, not against what was fetched.
  it('measures coverage against every session in the range, not just classified rows', () => {
    const r = buildReport({
      current: [row({}), row({})],
      previous: [],
      connectedChannels: ['web'],
      sessionsInRange: 100,
    });
    expect(r.coverage.total).toBe(100);
    expect(r.coverage.classified).toBe(2);
    expect(r.coverage.classifiedPct).toBe(2);
  });

  it('falls back to the rows it has when the session count is unknown', () => {
    const r = buildReport({ current: [row({}), row({})], previous: [], connectedChannels: ['web'] });
    expect(r.coverage.total).toBe(2);
    expect(r.coverage.classifiedPct).toBe(100);
  });

  it('reports zero percent rather than NaN for an empty range', () => {
    const r = buildReport({ current: [], previous: [], connectedChannels: ['web'] });
    expect(r.coverage.classifiedPct).toBe(0);
    expect(r.coverage.complaintsWithProductPct).toBe(0);
  });
});

describe('products', () => {
  // A bestseller accrues complaints by virtue of selling. Sorting by count
  // points the brand at its hit product instead of its faulty one.
  it('ranks by complaint rate, not complaint count', () => {
    const current = [
      ...Array.from({ length: 100 }, () => row({ product_id: 'hit', product_name: 'רב מכר' })),
      ...Array.from({ length: 10 }, () => row({ product_id: 'hit', product_name: 'רב מכר', is_complaint: true })),
      ...Array.from({ length: 4 }, () => row({ product_id: 'bad', product_name: 'בעייתי' })),
      ...Array.from({ length: 6 }, () => row({ product_id: 'bad', product_name: 'בעייתי', is_complaint: true })),
    ];
    const r = buildReport({ current, previous: [], connectedChannels: ['web'] });

    expect(r.products.byComplaintRate[0].productId).toBe('bad');
    expect(r.products.byComplaintRate[0].complaintRate).toBe(60);
    expect(r.products.byComplaintRate[1].productId).toBe('hit');
    // Most-discussed is still available, and there the bestseller leads.
    expect(r.products.byMentions[0].productId).toBe('hit');
  });

  it('ignores unresolved products in the product ranking', () => {
    const r = buildReport({
      current: [row({ product_id: null, is_complaint: true })],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.products.byComplaintRate).toEqual([]);
  });
});

describe('sample floor on rate rankings', () => {
  // Real numbers from Argania: חומצה היאלורונית showed 40% on 10 mentions while
  // סדרת קיק showed 6% on 509. Ranking purely by rate puts a ten-conversation
  // sample above the flagship line and sends the brand chasing noise.
  it('keeps a tiny sample from topping the complaint-rate ranking', () => {
    const current = [
      ...Array.from({ length: 2 }, () => row({ product_id: 'tiny', product_name: 'זעיר' })),
      ...Array.from({ length: 2 }, () => row({ product_id: 'tiny', product_name: 'זעיר', is_complaint: true })),
      ...Array.from({ length: 400 }, () => row({ product_id: 'big', product_name: 'גדול' })),
      ...Array.from({ length: 100 }, () => row({ product_id: 'big', product_name: 'גדול', is_complaint: true })),
    ];
    const r = buildReport({ current, previous: [], connectedChannels: ['web'] });

    // tiny is 50%, big is 20% — but tiny has 4 mentions and must not lead.
    expect(r.products.byComplaintRate[0].productId).toBe('big');
  });

  it('still reports the small sample, just not as a ranked signal', () => {
    const current = [
      ...Array.from({ length: 2 }, () => row({ product_id: 'tiny', product_name: 'זעיר' })),
      ...Array.from({ length: 2 }, () => row({ product_id: 'tiny', product_name: 'זעיר', is_complaint: true })),
    ];
    const r = buildReport({ current, previous: [], connectedChannels: ['web'] });
    expect(r.products.byMentions.find((p) => p.productId === 'tiny')).toBeTruthy();
    expect(r.products.byComplaintRate.find((p) => p.productId === 'tiny')?.belowSampleFloor).toBe(true);
  });

  it('applies the same floor to series', () => {
    const current = [
      ...Array.from({ length: 2 }, () => row({ product_line: 'קטנה' })),
      ...Array.from({ length: 2 }, () => row({ product_line: 'קטנה', is_complaint: true })),
      ...Array.from({ length: 400 }, () => row({ product_line: 'גדולה' })),
      ...Array.from({ length: 100 }, () => row({ product_line: 'גדולה', is_complaint: true })),
    ];
    const r = buildReport({ current, previous: [], connectedChannels: ['web'] });
    expect(r.series.byComplaintRate[0].line).toBe('גדולה');
  });
});

describe('deltas and channels', () => {
  it('computes topic movement against the previous period', () => {
    const r = buildReport({
      current: [row({ topic_label: 'נשירת שיער' }), row({ topic_label: 'נשירת שיער' }), row({ topic_label: 'משלוח' })],
      previous: [row({ topic_label: 'נשירת שיער' })],
      connectedChannels: ['web'],
    });
    const hair = r.topics.find((t) => t.label === 'נשירת שיער')!;
    expect(hair.count).toBe(2);
    expect(hair.previousCount).toBe(1);
    expect(hair.delta).toBe(1);

    const shipping = r.topics.find((t) => t.label === 'משלוח')!;
    expect(shipping.previousCount).toBe(0);
    expect(shipping.isNew).toBe(true);
  });

  // "0 Instagram inquiries" and "Instagram was never connected" are different
  // facts and must not render the same.
  it('marks an unconnected channel as unconnected, not zero', () => {
    const r = buildReport({
      current: [row({ channel: 'web' })],
      previous: [],
      connectedChannels: ['web', 'whatsapp'],
    });
    const ig = r.channels.find((c) => c.channel === 'instagram')!;
    expect(ig.connected).toBe(false);
    expect(ig.count).toBe(0);

    const wa = r.channels.find((c) => c.channel === 'whatsapp')!;
    expect(wa.connected).toBe(true);
    expect(wa.count).toBe(0);
  });
});

describe('kpis', () => {
  it('counts complaints, escalations and negative sentiment', () => {
    const r = buildReport({
      current: [
        row({ is_complaint: true, sentiment: 'negative', outcome: 'escalated' }),
        row({ outcome: 'resolved_by_bot' }),
      ],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.kpis.total).toBe(2);
    expect(r.kpis.complaints).toBe(1);
    expect(r.kpis.escalated).toBe(1);
    expect(r.kpis.resolvedByBot).toBe(1);
    expect(r.kpis.negative).toBe(1);
  });
});
