// tests/unit/pipeline/transcribe-step.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/state', () => ({ setCount: vi.fn() }));
describe('transcribeStep', () => {
  it('skips (advance) when transcription disabled', async () => {
    const { transcribeStep } = await import('@/lib/pipeline/steps/transcribe');
    const res = await transcribeStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'transcribe', batch: 0, state: { options: { transcribe: false } } as any });
    expect(res.status).toBe('advance');
  });
});
