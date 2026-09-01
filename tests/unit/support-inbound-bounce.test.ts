import { describe, it, expect } from 'vitest';
import { extractBouncedRecipient } from '@/lib/support/inbound-email';

const mk = (over: Partial<any>) => ({
  providerMessageId: 'm1',
  from: 'mailer-daemon@googlemail.com',
  subject: 'Delivery Status Notification (Failure)',
  body: '',
  ...over,
});

describe('extractBouncedRecipient', () => {
  it('reads the address out of a real Gmail failure notice', () => {
    // This is the body shape of the bounce logged at 2026-08-31 10:01:05 — six minutes
    // after ticket 99bb08a1 was filed, and discarded.
    const body = [
      'Address not found',
      '',
      "Your message wasn't delivered to lililevy42@gmail.com.il because the domain",
      "gmail.com.il couldn't be found. Check for typos or unnecessary spaces and try again.",
      '',
      'The response was:',
      "DNS Error: 2320449 DNS type 'mx' lookup of gmail.com.il responded with code NXDOMAIN",
    ].join('\n');
    expect(extractBouncedRecipient(mk({ body }))).toBe('lililevy42@gmail.com.il');
  });

  it('prefers the RFC 3464 Final-Recipient field when present', () => {
    const body = 'Final-Recipient: rfc822; dana@gamil.com\nAction: failed\nStatus: 5.1.1';
    expect(extractBouncedRecipient(mk({ body }))).toBe('dana@gamil.com');
  });

  it('prefers the X-Failed-Recipients header over any body text', () => {
    expect(extractBouncedRecipient(mk({
      failedRecipient: 'header@example.com',
      body: "Your message wasn't delivered to body@example.com because…",
    }))).toBe('header@example.com');
  });

  it('returns null for a DELAY notice — a delay is not a failure', () => {
    // Marking an address dead on a delay takes a working route away from a brand.
    expect(extractBouncedRecipient(mk({
      subject: 'Delivery Status Notification (Delay)',
      body: 'Your message to slow@example.com has been delayed.',
    }))).toBeNull();
  });

  it('returns null for a genuine customer reply', () => {
    // Companion presence assertion: proves the extractor is discriminating, not just
    // returning null because it is broken.
    expect(extractBouncedRecipient(mk({
      from: 'shopper@gmail.com',
      subject: 'Re: הפנייה שלך',
      body: 'תודה רבה! מתי זה יגיע?',
    }))).toBeNull();
  });

  it('returns null when the daemon writes about no address at all', () => {
    expect(extractBouncedRecipient(mk({ body: 'Message rejected by policy.' }))).toBeNull();
  });

  it('ignores the reporting MTA and picks the address that actually failed', () => {
    const body = 'Reporting-MTA: dns; googlemail.com\nFinal-Recipient: rfc822; real@dead.example';
    expect(extractBouncedRecipient(mk({ body }))).toBe('real@dead.example');
  });

  it('normalizes the extracted address', () => {
    const body = 'Final-Recipient: rfc822; LiliLevy42@Gmail.COM.il';
    expect(extractBouncedRecipient(mk({ body }))).toBe('lililevy42@gmail.com.il');
  });

  it('strips the trailing punctuation a sentence leaves behind', () => {
    const body = "Your message wasn't delivered to dana@dead.example.";
    expect(extractBouncedRecipient(mk({ body }))).toBe('dana@dead.example');
  });
});
