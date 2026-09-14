/**
 * Support-agent sessions live in a cookie named `agent_session_<username>`,
 * but getAgentSession never checked that the signed payload's `un` matched the
 * username it was asked about. An agent of account A could rename their
 * cookie to `agent_session_B` and pass checkInfluencerAuth('B') — full
 * dashboard access to another tenant via /api/influencer/*?username=B.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
// liveSession re-reads the agent row. In the attack the row is genuine: it is
// the attacker's own active agent on the attacker's own account.
let rowAccount = '';
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { account_id: rowAccount, first_name: 'Liz', last_name: 'Z', is_admin: false, is_active: true },
            error: null,
          }),
        }),
      }),
    }),
  },
  getInfluencerByUsername: vi.fn(),
}));

const SECRET = 'test-agent-session-secret';
process.env.AGENT_SESSION_SECRET = SECRET;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function agentToken(un: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(Buffer.from(JSON.stringify({
    v: 1, aid: 'agent-1', acc: `acc-of-${un}`, fn: 'Liz', ln: 'Z', adm: false, un, iat: now, exp: now + 3600,
  })));
  return `${payload}.${b64url(createHmac('sha256', SECRET).update(payload).digest())}`;
}

describe('agent session is bound to the account username it was issued for', () => {
  beforeEach(() => jar.clear());

  it("rejects account A's agent cookie renamed to account B", async () => {
    jar.set('agent_session_victim', agentToken('attacker'));
    rowAccount = 'acc-of-attacker';
    const { getAgentSession } = await import('@/lib/auth/agent-auth');
    const { checkInfluencerAuth } = await import('@/lib/auth/influencer-auth');
    expect(await getAgentSession('victim')).toBeNull();
    expect(await checkInfluencerAuth('victim')).toBe(false);
  });

  it("still accepts the agent's own cookie for their own account", async () => {
    jar.set('agent_session_victim', agentToken('victim'));
    rowAccount = 'acc-of-victim';
    const { getAgentSession } = await import('@/lib/auth/agent-auth');
    const { checkInfluencerAuth } = await import('@/lib/auth/influencer-auth');
    const s = await getAgentSession('victim');
    expect(s?.account_username).toBe('victim');
    expect(await checkInfluencerAuth('victim')).toBe(true);
  });
});
