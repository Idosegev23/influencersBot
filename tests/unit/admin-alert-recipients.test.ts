import { describe, it, expect, vi } from 'vitest';

// sendAdminAlert defaulted its recipient to GMAIL_SEND_FROM — bestie@ldrsgroup.com, the mailbox
// nobody watches. So the never-silent fallbacks ("אסקלציה ללא נמען", "Handoff ללא נמען") were
// themselves silent: an escalation that reached no brand recipient alerted into a void.
vi.mock('googleapis', () => ({ google: {} }));

describe('adminAlertRecipients', () => {
  it('defaults to a mailbox a human actually reads — never the send-from address', async () => {
    process.env.GMAIL_SEND_FROM = 'bestie@ldrsgroup.com';
    const { adminAlertRecipients, ADMIN_ALERT_RECIPIENTS } = await import('@/lib/email');
    expect(ADMIN_ALERT_RECIPIENTS).not.toContain('bestie@ldrsgroup.com');
    expect(ADMIN_ALERT_RECIPIENTS.length).toBeGreaterThan(0);
    expect(adminAlertRecipients()).toEqual(ADMIN_ALERT_RECIPIENTS);
    expect(adminAlertRecipients([])).toEqual(ADMIN_ALERT_RECIPIENTS);
  });

  it('an explicit recipient list still wins', async () => {
    const { adminAlertRecipients } = await import('@/lib/email');
    expect(adminAlertRecipients(['someone@ldrsgroup.com'])).toEqual(['someone@ldrsgroup.com']);
  });

  it('is overridable by env for a team that routes alerts elsewhere', async () => {
    vi.resetModules();
    process.env.ADMIN_ALERT_EMAILS = 'a@x.com, b@x.com';
    const { ADMIN_ALERT_RECIPIENTS } = await import('@/lib/email');
    expect(ADMIN_ALERT_RECIPIENTS).toEqual(['a@x.com', 'b@x.com']);
    delete process.env.ADMIN_ALERT_EMAILS;
  });
});
