import { describe, it, expect } from 'vitest';
import { redactCoexistenceSync } from '@/lib/whatsapp-cloud/redact-sync';

const syncPayload = {
  object: 'whatsapp_business_account',
  entry: [{ id: 'W', changes: [{ field: 'smb_app_state_sync', value: {
    metadata: { phone_number_id: 'P', display_phone_number: '972500000000' },
    state_sync: [
      { type: 'contact', action: 'add', contact: { full_name: 'Jane Shopper', phone_number: '972511111111' } },
      { type: 'contact', action: 'add', contact: { full_name: 'Other Person', phone_number: '972522222222' } },
    ],
  } }] }],
};

describe('Coexistence sync payloads are stored as counts only', () => {
  it('drops every name and phone number from a state sync, keeping metadata and a count', () => {
    const out = redactCoexistenceSync(syncPayload);
    const text = JSON.stringify(out);
    expect(text).not.toContain('Jane Shopper');
    expect(text).not.toContain('972511111111');
    expect(out.entry[0].changes[0].value).toEqual({
      metadata: { phone_number_id: 'P', display_phone_number: '972500000000' },
      redacted: true,
      counts: { state_sync: 2 },
    });
  });

  it('redacts history the same way', () => {
    const out = redactCoexistenceSync({ entry: [{ changes: [{ field: 'history', value: { history: [{ threads: [{ messages: [{ text: { body: 'secret' } }] }] }] } }] }] });
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(out.entry[0].changes[0].value.counts).toEqual({ history: 1 });
  });

  it('passes an ordinary inbound message through unchanged', () => {
    const msg = { entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '972533333333', text: { body: 'hi' } }] } }] }] };
    expect(redactCoexistenceSync(msg)).toBe(msg);
  });
});
