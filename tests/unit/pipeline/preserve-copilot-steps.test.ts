// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryDb, type MemoryDb } from '../copilot/memory-db';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.db }));
vi.mock('@/lib/utils', () => ({ hashPassword: async () => 'hashed' }));
vi.mock('@/lib/chat-ui/generate-tab-config', () => ({ generateTabConfig: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/processing/generate-chat-config', () => ({ generateAndSaveChatConfig: vi.fn().mockResolvedValue({}) }));

import { finalizeStep } from '@/lib/pipeline/steps/finalize';
import { createAccountStep } from '@/lib/pipeline/steps/create-account';

const ACC = '11111111-1111-4111-8111-111111111111';
let db: MemoryDb;

/** A console settings save lands right after the step's first read of the account. */
function saveSettingsAfterFirstRead() {
  const from = db.from.bind(db);
  let reads = 0;
  db.from = (t: string) => {
    const b = from(t);
    if (t !== 'accounts') return b;
    const single = b.single;
    b.single = async () => {
      const r = await single();
      if (++reads === 1) db.tables.accounts[0].config = { ...db.tables.accounts[0].config, copilot: { tone: 'saved by staff', branding: { primary: '#03538A' } } };
      return r;
    };
    return b;
  };
}

beforeEach(() => {
  db = memoryDb({
    accounts: [{ id: ACC, config: { username: 'uma', display_name: 'UMA', archetype: 'association', copilot: { tone: 'old' } }, security_config: { admin_password_hash: 'x' } }],
    scan_jobs: [{ id: 'j1', account_id: ACC, requested_by: 'partner:p' }],
  });
  h.db = db;
});

const ctx = (step: string) => ({ jobId: 'j1', accountId: ACC, username: 'uma.org', step, batch: 0, state: { options: { isDemo: false, archetype: 'association' } } }) as any;

describe('pipeline whole-config writes keep a copilot save made mid-step', () => {
  it('finalize', async () => {
    saveSettingsAfterFirstRead();
    await finalizeStep(ctx('finalize'));
    const cfg = db.tables.accounts[0].config;
    expect(cfg.copilot).toEqual({ tone: 'saved by staff', branding: { primary: '#03538A' } });
    expect(cfg.scan_mode).toBe('full'); // the step's own write still landed
  });

  it('create-account', async () => {
    saveSettingsAfterFirstRead();
    await createAccountStep(ctx('create-account'));
    const cfg = db.tables.accounts[0].config;
    expect(cfg.copilot).toEqual({ tone: 'saved by staff', branding: { primary: '#03538A' } });
    expect(cfg.isDemo).toBe(false);
  });
});
