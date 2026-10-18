// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const subjects: Array<string | undefined> = [];
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class { constructor(o: any) { subjects.push(o.subject); } } },
    gmail: () => ({ users: { messages: { send: async () => ({ data: { id: 'm1' } }) } } }),
  },
}));

beforeEach(() => {
  subjects.length = 0;
  vi.resetModules();
  process.env.GMAIL_SEND_FROM = 'platform@vendor.test';
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'sa@x.test', private_key: 'k' });
});

describe('Gmail impersonation', () => {
  it('sendEmail acts as the impersonated mailbox, else the platform one', async () => {
    const { sendEmail } = await import('@/lib/email');
    await sendEmail({ to: 'a@b.test', subject: 's', html: 'h', impersonate: 'assistant@multiview.test' });
    await sendEmail({ to: 'a@b.test', subject: 's', html: 'h' });
    expect(subjects).toEqual(['assistant@multiview.test', 'platform@vendor.test']);
  });

  it('sendEmailWithAttachments honours impersonate too', async () => {
    const { sendEmailWithAttachments } = await import('@/lib/email');
    await sendEmailWithAttachments({ to: 'a@b.test', subject: 's', html: 'h', impersonate: 'assistant@multiview.test', attachments: [] });
    await sendEmailWithAttachments({ to: 'a@b.test', subject: 's', html: 'h', attachments: [] });
    expect(subjects).toEqual(['assistant@multiview.test', 'platform@vendor.test']);
  });
});
