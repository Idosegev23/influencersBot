import type { AmsAdapter } from './types';
import { StubAmsAdapter } from './stub';

/** Adapter for an association, from accounts.config. Null when no AMS is configured. */
export function getAmsAdapter(config: unknown): AmsAdapter | null {
  const ams = (config as any)?.copilot?.ams;
  if (!ams || typeof ams.provider !== 'string') return null;
  if (ams.provider === 'stub') return new StubAmsAdapter(Array.isArray(ams.stub_members) ? ams.stub_members : []);
  console.error('[copilot/ams] unknown provider', ams.provider);
  return null;
}
