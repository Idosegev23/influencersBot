/** Shared world for the console route tests: two partners, three associations, every kind of console user. */
import { signConsoleToken } from '@/lib/copilot/console-auth';
import { memoryDb, type MemoryDb } from './memory-db';

export const SECRET = 'c'.repeat(48);
export const PA = 'partner-A';
export const PB = 'partner-B';
export const BASE = 'copilot-dev.test';
export const ACC1 = '11111111-1111-4111-8111-111111111111';
export const ACC2 = '22222222-2222-4222-8222-222222222222';
export const ACCX = '99999999-9999-4999-8999-999999999999'; // partner B's
export const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export const USERS = {
  owner: { id: 'u-owner', partner_id: PA, account_id: null, email: 'owner@mv.test', name: 'Olive', role: 'owner', status: 'active' },
  admin: { id: 'u-admin', partner_id: PA, account_id: null, email: 'admin@mv.test', name: 'Ada', role: 'admin', status: 'active' },
  viewer: { id: 'u-viewer', partner_id: PA, account_id: null, email: 'viewer@mv.test', name: 'Vic', role: 'viewer', status: 'active' },
  assocAdmin: { id: 'u-aadmin', partner_id: PA, account_id: ACC1, email: 'staff@aba.test', name: 'Sam', role: 'admin', status: 'active' },
  assocViewer: { id: 'u-aviewer', partner_id: PA, account_id: ACC1, email: 'look@aba.test', name: 'Lou', role: 'viewer', status: 'active' },
  otherOwner: { id: 'u-bowner', partner_id: PB, account_id: null, email: 'boss@other.test', name: 'Bo', role: 'owner', status: 'active' },
} as const;
export type UserKey = keyof typeof USERS;

export function tokenFor(k: UserKey): string {
  const u = USERS[k];
  return signConsoleToken({ u: u.id, p: u.partner_id, a: u.account_id, r: u.role as any, e: Date.now() + 60_000 }, SECRET);
}

/** The tenant a console call by this user resolves to (each partner calls through its own base host). */
export function tenantFor(k: UserKey) {
  const u = USERS[k];
  return u.partner_id === PA ? { partnerId: PA, accountId: null, host: BASE } : { partnerId: PB, accountId: null, host: 'other-base.test' };
}

export function world(): MemoryDb {
  const db = memoryDb({
    console_users: Object.values(USERS).map((u) => ({ ...u })),
    accounts: [
      { id: ACC1, partner_id: PA, created_at: '2026-10-01T00:00:00Z', config: { username: 'aba', display_name: 'American Bus Association', website_url: 'https://www.buses.org/', copilot: { industry: 'motorcoach', identify_secret_ref: 'secret-ref', branding: { primary: '#041423', secret_token: 'x' }, opening_questions: ['How do I join?'], escalation: { recipients: ['help@buses.org'], extra: 1 }, links: { join: 'https://buses.org/join', other: 'https://buses.org/o' } } } },
      { id: ACC2, partner_id: PA, created_at: '2026-10-02T00:00:00Z', config: { username: 'nta', display_name: 'NTA', website_url: 'https://ntaonline.com' } },
      { id: ACCX, partner_id: PB, created_at: '2026-10-03T00:00:00Z', config: { username: 'theirs', display_name: 'Theirs' } },
    ],
    tenant_domains: [
      { host: BASE, partner_id: PA, account_id: null },
      { host: `aba.${BASE}`, partner_id: PA, account_id: ACC1 },
      { host: `nta.${BASE}`, partner_id: PA, account_id: ACC2 },
      { host: 'theirs.other-base.test', partner_id: PB, account_id: ACCX },
    ],
    chat_sessions: [],
    chat_messages: [],
    support_requests: [],
    visitors: [],
    conversation_topics: [],
    scan_jobs: [],
  });
  db.rpcs.partner_account_counts = ({ p_account_ids }: any) => ({
    data: p_account_ids.map((id: string) => ({ account_id: id, sessions: id === ACC1 ? 3 : 0, messages: id === ACC1 ? 12 : 0, escalations: id === ACC1 ? 1 : 0, last_activity: id === ACC1 ? '2026-10-17T10:00:00Z' : null })),
    error: null,
  });
  db.rpcs.copilot_merge_config = ({ p_account_id, p_patch }: any) => {
    const a = db.tables.accounts.find((r) => r.id === p_account_id);
    if (!a) return { data: null, error: null };
    a.config = { ...(a.config ?? {}), copilot: { ...(a.config?.copilot ?? {}), ...p_patch } };
    return { data: a.config.copilot, error: null };
  };
  return db;
}
