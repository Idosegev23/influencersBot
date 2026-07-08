import { describe, it, expect } from 'vitest';
import { buildAgentWaLogRow } from '@/lib/crm/wa-log';

describe('buildAgentWaLogRow', () => {
  it('assembles a row with defaults', () => {
    const row = buildAgentWaLogRow({
      messageId: 'wamid.123',
      agentId: 'agent-1',
      channel: 'voice',
      transcript: 'תמחר את אנה ב-80 אלף',
      outcome: 'done',
      latencyMs: 1234,
    });
    expect(row).toMatchObject({
      message_id: 'wamid.123',
      agent_id: 'agent-1',
      channel: 'voice',
      transcript: 'תמחר את אנה ב-80 אלף',
      outcome: 'done',
      latency_ms: 1234,
      agent_corrected: false,
    });
    expect(row.plan_json).toBeNull();
    expect(row.model_used).toBeNull();
    expect(row.amount).toBeNull();
  });
  it('passes through telemetry from the brain', () => {
    const row = buildAgentWaLogRow({
      messageId: 'wamid.9', agentId: 'a', channel: 'text', outcome: 'need_more', latencyMs: 10,
      log: { plan_json: { action: 'price' }, model_used: 'gpt-5-nano', input_tokens: 900, output_tokens: 40, deal_id: 'd1', amount: 80000, router_intent: 'price' },
    });
    expect(row.plan_json).toEqual({ action: 'price' });
    expect(row.model_used).toBe('gpt-5-nano');
    expect(row.amount).toBe(80000);
    expect(row.deal_id).toBe('d1');
  });
});
