// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryDb, type MemoryDb } from '../copilot/memory-db';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.db }));
vi.mock('@/lib/utils', () => ({ hashPassword: async () => 'hashed' }));

import { createAccountStep } from '@/lib/pipeline/steps/create-account';

const ACC = '11111111-1111-4111-8111-111111111111';
let db: MemoryDb;
const ctx = (over: any = {}) => ({
  jobId: 'job-1', accountId: ACC, username: 'uma.org', step: 'create-account', batch: 0,
  state: { currentStep: 'create-account', counts: {}, cursors: {}, options: { isDemo: false, language: 'en' } },
  ...over,
}) as any;

beforeEach(() => {
  db = memoryDb({ accounts: [], scan_jobs: [{ id: 'job-1', account_id: ACC, requested_by: 'admin:pipeline' }] });
  h.db = db;
});

describe('createAccountStep', () => {
  it('keeps an existing config.username (the console slug), never replacing it with the scan anchor', async () => {
    db.tables.accounts.push({ id: ACC, config: { username: 'uma', display_name: 'UMA', copilot: { tone: 't' } }, security_config: {} });
    expect(await createAccountStep(ctx())).toEqual({ status: 'advance' });
    const cfg = db.tables.accounts[0].config;
    expect(cfg.username).toBe('uma');
    expect(cfg.username).not.toBe('uma.org');
    expect(cfg.copilot).toEqual({ tone: 't' });
    expect(cfg.isDemo).toBe(false);
  });

  it('an existing account without a username gets the scan anchor', async () => {
    db.tables.accounts.push({ id: ACC, config: { display_name: 'X' }, security_config: {} });
    await createAccountStep(ctx());
    expect(db.tables.accounts[0].config.username).toBe('uma.org');
  });

  it('a fresh (admin) account is inserted with ctx.username', async () => {
    expect(await createAccountStep(ctx())).toEqual({ status: 'advance' });
    expect(db.tables.accounts).toHaveLength(1);
    expect(db.tables.accounts[0].config.username).toBe('uma.org');
  });

  it('a partner-started job never re-creates an account that was rolled back', async () => {
    db.tables.scan_jobs[0].requested_by = 'partner:partner-A';
    const r = await createAccountStep(ctx());
    expect(r.status).toBe('failed');
    expect(db.tables.accounts).toHaveLength(0);
  });

  it('a partner-started job on an existing account advances normally', async () => {
    db.tables.scan_jobs[0].requested_by = 'partner:partner-A';
    db.tables.accounts.push({ id: ACC, config: { username: 'uma' }, security_config: { admin_password_hash: 'x' } });
    expect(await createAccountStep(ctx())).toEqual({ status: 'advance' });
    expect(db.tables.accounts[0].config.username).toBe('uma');
  });
});
