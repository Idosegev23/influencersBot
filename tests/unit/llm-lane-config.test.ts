import { describe, it, expect, afterEach } from 'vitest';
import { laneModel } from '@/lib/llm/config';

// The WhatsApp CS brain used to read the `money` lane, which it shares with the Bestie sales
// agent, the dashboard agent and the CRM. Moving CS to a cheaper model must not move them.
describe('laneModel', () => {
  afterEach(() => { delete process.env.AGENT_MODEL_CS; delete process.env.AGENT_MODEL_MONEY; });

  it('the CS lane is its own lane, independent of money', () => {
    process.env.AGENT_MODEL_MONEY = 'money-model';
    expect(laneModel('cs')).not.toBe('money-model');
    expect(laneModel('money')).toBe('money-model');
  });

  it('the CS lane is env-overridable for an instant rollback', () => {
    process.env.AGENT_MODEL_CS = 'gpt-5.6-sol';
    expect(laneModel('cs')).toBe('gpt-5.6-sol');
  });

  it('the router lane defaults to gpt-6-luna, CS to gpt-6-sol, and money stays on gpt-5.6-sol', () => {
    expect(laneModel('router')).toBe('gpt-6-luna');
    expect(laneModel('cs')).toBe('gpt-6-sol');
    expect(laneModel('money')).toBe('gpt-5.6-sol');
  });
});
