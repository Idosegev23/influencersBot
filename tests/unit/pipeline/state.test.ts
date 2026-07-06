import { describe, it, expect, vi } from 'vitest';
const rows: Record<string, any> = {};
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: rows['j1'] ?? null }) }) }),
      update: (patch: any) => ({ eq: async () => { rows['j1'] = { ...rows['j1'], ...patch }; return {}; } }),
    }),
  }),
}));
describe('state', () => {
  it('setCount merges counts into pipeline_state', async () => {
    rows['j1'] = { pipeline_state: { currentStep: 'transcribe', counts: {}, cursors: {}, options: {} } };
    const { setCount, loadState } = await import('@/lib/pipeline/state');
    await setCount('j1', 'transcribe', { done: 3, total: 37 });
    const s = await loadState('j1');
    expect(s.counts.transcribe).toEqual({ done: 3, total: 37 });
  });
});
