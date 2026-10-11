import { describe, it, expect, vi, beforeEach } from 'vitest';

let rows: any[] = [];
const updates: Array<{ id: string; patch: any }> = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async (_c: string, waba: string) => ({ data: rows.filter((r) => r.waba_id === waba) }) }),
      update: (patch: any) => ({ eq: async (_c: string, id: string) => { updates.push({ id, patch }); return { error: null }; } }),
    }),
  },
}));

beforeEach(() => { updates.length = 0; rows = [{ id: 'ch-lb', waba_id: 'W-LB', templates: { cs_human_reply: 'PENDING' } }]; });

describe('template review results reach the channel row', () => {
  it('marks cs_followup APPROVED on the channel that owns the WABA, keeping the others', async () => {
    const { recordTemplateStatus } = await import('@/lib/whatsapp-cloud/template-status');
    const ok = await recordTemplateStatus('W-LB', { event: 'APPROVED', message_template_name: 'cs_followup' });
    expect(ok).toBe(true);
    expect(updates).toEqual([{ id: 'ch-lb', patch: { templates: { cs_human_reply: 'PENDING', cs_followup: 'APPROVED' } } }]);
  });

  it('writes nothing for a WABA with no channel', async () => {
    const { recordTemplateStatus } = await import('@/lib/whatsapp-cloud/template-status');
    expect(await recordTemplateStatus('W-OTHER', { event: 'APPROVED', message_template_name: 'cs_followup' })).toBe(false);
    expect(updates).toEqual([]);
  });

  it('writes nothing for a malformed payload', async () => {
    const { recordTemplateStatus } = await import('@/lib/whatsapp-cloud/template-status');
    expect(await recordTemplateStatus('W-LB', { message_template_name: 'cs_followup' })).toBe(false);
    expect(updates).toEqual([]);
  });
});
