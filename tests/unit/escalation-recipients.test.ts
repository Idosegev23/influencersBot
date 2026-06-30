import { describe, it, expect } from 'vitest';
import { resolveRecipients } from '@/engines/escalation/recipients';

// Minimal fake matching the chained calls resolveRecipients uses.
function fakeSupabase(agents: any[]) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        then(resolve: any) { return resolve({ data: agents, error: null }); },
      };
    },
  };
}

describe('resolveRecipients', () => {
  it('returns configured recipients when present (ignores DB)', async () => {
    const cfg = { recipients: [{ name: 'יואב', email: 'yoav@x.com', whatsapp: '97250' }] };
    const out = await resolveRecipients(fakeSupabase([]), 'acc', cfg);
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe('yoav@x.com');
  });

  it('drops configured recipients that have neither email nor whatsapp', async () => {
    const cfg = { recipients: [{ name: 'empty' }, { name: 'ok', email: 'a@b.com' }] };
    const out = await resolveRecipients(fakeSupabase([]), 'acc', cfg);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('ok');
  });

  it('falls back to active support_agents with email', async () => {
    const agents = [
      { first_name: 'Dana', last_name: 'Levi', email: 'dana@x.com', is_active: true },
      { first_name: 'NoEmail', last_name: '', email: null, is_active: true },
    ];
    const out = await resolveRecipients(fakeSupabase(agents), 'acc', { recipients: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: 'Dana Levi', email: 'dana@x.com' });
  });

  it('returns empty when neither config nor agents resolve', async () => {
    const out = await resolveRecipients(fakeSupabase([]), 'acc', undefined);
    expect(out).toEqual([]);
  });
});
