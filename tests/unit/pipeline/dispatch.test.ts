import { describe, it, expect } from 'vitest';
import { STEP_HANDLERS } from '@/lib/pipeline/steps';
import { STEP_ORDER } from '@/lib/pipeline/types';

describe('STEP_HANDLERS', () => {
  it('has a handler for every step', () => {
    for (const s of STEP_ORDER) expect(typeof STEP_HANDLERS[s]).toBe('function');
  });
});
