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
});
