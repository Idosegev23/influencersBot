import { describe, it, expect } from 'vitest';
import { STEP_ORDER, nextStep } from '@/lib/pipeline/types';

describe('STEP_ORDER', () => {
  it('starts at create-account and ends at finalize', () => {
    expect(STEP_ORDER[0]).toBe('create-account');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('finalize');
  });
  it('nextStep advances and returns null at the end', () => {
    expect(nextStep('create-account')).toBe('ig-scan');
    expect(nextStep('finalize')).toBeNull();
  });
  it('PipelineOptions type accepts categories + scanMode (compile check)', () => {
    const opts: import('@/lib/pipeline/types').PipelineOptions = { transcribe: true, maxPages: null, postsLimit: 50, isDemo: true, scanMode: 'quote', categories: [{ pathPattern: '/', cap: 30 }] };
    expect(opts.categories?.[0].cap).toBe(30);
  });
});
