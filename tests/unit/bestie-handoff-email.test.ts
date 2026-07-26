import { describe, it, expect } from 'vitest';
import { buildHandoffEmail, SALES_RECIPIENTS } from '@/lib/bestie/handoff-email';

const lead = {
  full_name: 'ישראל ישראלי',
  wa_id: '972501234567',
  email: 'i@example.com',
  campaign_id: 'C1',
  qualification: { business: 'חנות בגדים', size: '3 עובדים' },
};
const transcript = [
  { role: 'user', text: 'כמה זה עולה?' },
  { role: 'assistant', text: 'תלוי בהיקף — אעביר אותך לאיש מכירות.' },
];

describe('buildHandoffEmail', () => {
  it('goes to all five recipients', () => {
    expect(SALES_RECIPIENTS).toEqual([
      'kfir@ldrsgroup.com',
      'roei@ldrsgroup.com',
      'itamar@ldrsgroup.com',
      'cto@ldrsgroup.com',
      'yoav@ldrsgroup.com',
    ]);
  });

  it('puts the name and phone in the subject so it is actionable from a notification', () => {
    const { subject } = buildHandoffEmail({ lead, summary: 'מוכן לשיחה', transcript });
    expect(subject).toContain('ישראל ישראלי');
    expect(subject).toContain('972501234567');
  });

  it('carries the full transcript, not just the summary', () => {
    const { html } = buildHandoffEmail({ lead, summary: 'מוכן לשיחה', transcript });
    expect(html).toContain('כמה זה עולה?');
    expect(html).toContain('אעביר אותך לאיש מכירות');
    expect(html).toContain('מוכן לשיחה');
  });

  it('includes what was learned about the business', () => {
    const { html } = buildHandoffEmail({ lead, summary: 's', transcript });
    expect(html).toContain('חנות בגדים');
    expect(html).toContain('3 עובדים');
  });

  it('escapes text so a lead cannot inject markup into the email', () => {
    const { html } = buildHandoffEmail({
      lead: { ...lead, full_name: '<script>alert(1)</script>' },
      summary: 's',
      transcript: [{ role: 'user', text: '<img src=x onerror=alert(2)>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });

  it('survives a lead with almost nothing filled in', () => {
    const { subject, html } = buildHandoffEmail({
      lead: { wa_id: '972500000000' },
      summary: '',
      transcript: [],
    });
    expect(subject).toBeTruthy();
    expect(html).toBeTruthy();
    expect(subject).toContain('972500000000');
  });

  it('offers a click-to-open WhatsApp link so a salesperson can reply immediately', () => {
    const { html } = buildHandoffEmail({ lead, summary: 's', transcript });
    expect(html).toContain('wa.me/972501234567');
  });
});
