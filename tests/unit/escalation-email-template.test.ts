import { describe, it, expect } from 'vitest';
import { buildEscalationEmail } from '@/engines/escalation/email-template';

describe('buildEscalationEmail', () => {
  const base = {
    brandName: 'LA BEAUTÉ',
    reason: 'איום בתביעה / פנייה משפטית + כעס מתמשך לאורך השיחה',
    severity: 'critical' as const,
    customerPhone: '0501234567',
    userMessage: 'אני אתבע אתכם',
    lastMessages: [
      { role: 'user', content: 'איפה ההזמנה שלי' },
      { role: 'assistant', content: 'בודקת עבורך' },
    ],
    sessionId: 'sess-123',
  };

  it('puts brand + severity in the subject', () => {
    const { subject } = buildEscalationEmail(base);
    expect(subject).toContain('LA BEAUTÉ');
    expect(subject).toContain('אסקלצ');
  });

  it('includes the reason, phone, and triggering message in the html', () => {
    const { html } = buildEscalationEmail(base);
    expect(html).toContain('איום בתביעה');
    expect(html).toContain('0501234567');
    expect(html).toContain('אני אתבע אתכם');
    expect(html).toContain('sess-123');
  });

  // The email is where the escalation is actually READ — whoever opens it must be able to act from
  // it, not have to find the ticket to learn whether the customer can be reached at all.
  it('makes the phone actionable — a WhatsApp link and a dialable tel: link', () => {
    const { html } = buildEscalationEmail(base);
    expect(html).toContain('https://wa.me/972501234567');
    expect(html).toContain('tel:0501234567');
  });

  it('carries the email address too — a shopper who gave only one is still reachable', () => {
    const { html } = buildEscalationEmail({ ...base, customerPhone: null, customerEmail: 'dana@example.com' });
    expect(html).toContain('mailto:dana@example.com');
    expect(html).not.toContain('אין שום דרך ליצור קשר');
  });

  // "לא ידוע" reads as "we lost it". Say plainly that nobody can answer this one, and say why.
  it('says outright that the customer is unreachable when neither channel exists', () => {
    const { html } = buildEscalationEmail({ ...base, customerPhone: null, customerEmail: null });
    expect(html).toContain('אין שום דרך ליצור קשר');
    expect(html).toContain('sess-123');
    expect(html).not.toContain('tel:');
  });

  // A stored-but-undialable value must not silently vanish: "junk value" ≠ "never given" — the
  // same rule the ticket panel follows.
  it('shows an unusable number as unusable rather than hiding it', () => {
    const { html } = buildEscalationEmail({ ...base, customerPhone: 'aw_7l1bkwnamt5ov1fq' });
    expect(html).toContain('aw_7l1bkwnamt5ov1fq');
    expect(html).toContain('אינו תקין');
    expect(html).not.toContain('wa.me');
  });

  it('escapes customer-supplied contact values', () => {
    const { html } = buildEscalationEmail({ ...base, customerPhone: null, customerEmail: null, customerName: '<script>x</script>' });
    expect(html).not.toContain('<script>');
  });
});
