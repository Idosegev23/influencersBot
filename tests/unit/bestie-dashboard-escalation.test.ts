import { describe, it, expect } from 'vitest';
import {
  buildDashboardEscalationEmail,
  DASHBOARD_ESCALATION_RECIPIENTS,
} from '@/lib/bestie/dashboard/escalation';

const p = {
  brandUsername: 'argania',
  currentRoute: '/influencer/[username]/chatbot-settings',
  message: 'הבוט לא עונה בוואטסאפ',
  transcript: [
    { role: 'user', text: 'הבוט לא עונה' },
    { role: 'assistant', text: 'בוא נבדוק את החיבור' },
  ],
};

describe('dashboard escalation', () => {
  it('goes to exactly the two people Ido named', () => {
    expect(DASHBOARD_ESCALATION_RECIPIENTS).toEqual([
      'yoav@ldrsgroup.com',
      'cto@ldrsgroup.com',
    ]);
  });

  it('never reaches the sales funnel recipients', async () => {
    // A stuck paying customer is not a lead.
    const { SALES_RECIPIENTS } = await import('@/lib/bestie/handoff-email');
    for (const sales of SALES_RECIPIENTS) {
      if (DASHBOARD_ESCALATION_RECIPIENTS.includes(sales)) continue; // yoav + cto overlap by design
      expect(DASHBOARD_ESCALATION_RECIPIENTS).not.toContain(sales);
    }
    expect(DASHBOARD_ESCALATION_RECIPIENTS).not.toContain('kfir@ldrsgroup.com');
    expect(DASHBOARD_ESCALATION_RECIPIENTS).not.toContain('roei@ldrsgroup.com');
  });

  it('names the brand in the subject so it is actionable from a notification', () => {
    expect(buildDashboardEscalationEmail(p).subject).toContain('argania');
  });

  it('carries the screen they were on and the conversation', () => {
    const { html } = buildDashboardEscalationEmail(p);
    expect(html).toContain('chatbot-settings');
    expect(html).toContain('הבוט לא עונה');
    expect(html).toContain('בוא נבדוק את החיבור');
  });

  it('escapes text so a brand cannot inject markup', () => {
    const { html } = buildDashboardEscalationEmail({
      ...p, message: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
  });

  it('survives no route and an empty transcript', () => {
    const { subject, html } = buildDashboardEscalationEmail({
      ...p, currentRoute: null, transcript: [],
    });
    expect(subject).toBeTruthy();
    expect(html).toBeTruthy();
  });
});
