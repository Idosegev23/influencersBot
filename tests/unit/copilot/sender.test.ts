// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { assistantSender } from '@/lib/copilot/escalate';
import { gmailSubjectFor } from '@/lib/email';

const saved = { c: process.env.COPILOT_SEND_FROM, g: process.env.GMAIL_SEND_FROM };
afterEach(() => {
  for (const [k, v] of [['COPILOT_SEND_FROM', saved.c], ['GMAIL_SEND_FROM', saved.g]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('assistantSender', () => {
  it('uses COPILOT_SEND_FROM and impersonates that mailbox', () => {
    process.env.COPILOT_SEND_FROM = 'assistant@multiview.test';
    process.env.GMAIL_SEND_FROM = 'bestie@platform.test';
    const s = assistantSender('ABA', { staffOnly: false });
    expect(s).toEqual({ from: '"ABA Assistant" <assistant@multiview.test>', impersonate: 'assistant@multiview.test' });
    expect(JSON.stringify(s)).not.toContain('platform.test');
  });
  it('mail to a visitor is not sent from the platform mailbox: null without COPILOT_SEND_FROM', () => {
    delete process.env.COPILOT_SEND_FROM;
    process.env.GMAIL_SEND_FROM = 'bestie@platform.test';
    expect(assistantSender('ABA', { staffOnly: false })).toBeNull();
  });
  it('mail to association staff keeps the platform mailbox as a fallback (escalations must not drop)', () => {
    delete process.env.COPILOT_SEND_FROM;
    process.env.GMAIL_SEND_FROM = 'bestie@platform.test';
    expect(assistantSender('ABA', { staffOnly: true })).toEqual({ from: '"ABA Assistant" <bestie@platform.test>' });
  });
  it('an invalid COPILOT_SEND_FROM counts as unset', () => {
    process.env.COPILOT_SEND_FROM = 'Multiview <x@y.z>';
    delete process.env.GMAIL_SEND_FROM;
    expect(assistantSender('ABA', { staffOnly: false })).toBeNull();
  });
});

describe('gmailSubjectFor', () => {
  it('impersonates the given mailbox, else the platform sender', () => {
    process.env.GMAIL_SEND_FROM = 'bestie@platform.test';
    expect(gmailSubjectFor({ impersonate: 'assistant@multiview.test' })).toBe('assistant@multiview.test');
    expect(gmailSubjectFor({ impersonate: '  ' })).toBe(gmailSubjectFor({}));
    expect(gmailSubjectFor({ impersonate: '  ' })).not.toBe('  ');
  });
});
