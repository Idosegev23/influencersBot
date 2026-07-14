import { describe, it, expect } from 'vitest';
import { shouldShowTutorial } from '@/lib/onboarding/tutorial';

describe('shouldShowTutorial', () => {
  it('shows for a freshly-onboarded (ready) account that has not seen it', () => {
    expect(shouldShowTutorial({ onboarding: { status: 'ready' } })).toBe(true);
  });
  it('hides once seen', () => {
    expect(shouldShowTutorial({ onboarding: { status: 'ready' }, tutorial_seen: true })).toBe(false);
  });
  it('hides while still scanning or for non-onboarding accounts', () => {
    expect(shouldShowTutorial({ onboarding: { status: 'scanning' } })).toBe(false);
    expect(shouldShowTutorial({})).toBe(false);
    expect(shouldShowTutorial(null)).toBe(false);
  });
});
