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

  it('handles missing phone gracefully', () => {
    const { html } = buildEscalationEmail({ ...base, customerPhone: null });
    expect(html).toContain('לא ידוע');
  });
});
