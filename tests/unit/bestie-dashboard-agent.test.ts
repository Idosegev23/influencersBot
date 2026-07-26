import { describe, it, expect, vi } from 'vitest';
import { runDashboardTurn, DASHBOARD_SYSTEM_PROMPT } from '@/lib/bestie/dashboard/dashboard-agent';

const ctx = {
  accountId: 'A1',
  username: 'argania',
  currentRoute: '/influencer/[username]/chatbot-settings',
  language: 'he',
};

describe('runDashboardTurn', () => {
  it('calls a tool and answers from the result', async () => {
    const turns = [
      { toolCalls: [{ id: 't1', name: 'run_health_check', args: {} }], text: null },
      { toolCalls: [], text: 'יש לך 3 קופונים פגי תוקף.' },
    ];
    let i = 0;
    const result = await runDashboardTurn(
      { ctx, message: 'מה לא בסדר אצלי?' },
      { callModel: async () => turns[i++] as any, runTool: async () => ({ ok: true, data: {} }) }
    );
    expect(result.reply).toContain('קופונים');
  });

  it('tells the model which screen the customer is on', async () => {
    const callModel = vi.fn(async () => ({ toolCalls: [], text: 'ok' }));
    await runDashboardTurn(
      { ctx, message: 'איפה המתג?' },
      { callModel: callModel as any, runTool: async () => ({ ok: true }) }
    );
    const system = (callModel.mock.calls[0] as any)[0].system;
    expect(system).toContain('chatbot-settings');
  });

  it('omits the screen line when the route is unknown', async () => {
    const callModel = vi.fn(async () => ({ toolCalls: [], text: 'ok' }));
    await runDashboardTurn(
      { ctx: { ...ctx, currentRoute: null }, message: 'x' },
      { callModel: callModel as any, runTool: async () => ({ ok: true }) }
    );
    expect((callModel.mock.calls[0] as any)[0].system).not.toContain('נמצא כרגע במסך');
  });

  it('stops instead of looping forever', async () => {
    const callModel = vi.fn(async () => ({
      toolCalls: [{ id: 't', name: 'run_health_check', args: {} }],
      text: null,
    }));
    await runDashboardTurn(
      { ctx, message: 'x' },
      { callModel: callModel as any, runTool: async () => ({ ok: true }) }
    );
    expect(callModel.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('passes the session context to every tool, never anything from the message', async () => {
    const runTool = vi.fn(async () => ({ ok: true, data: {} }));
    const turns = [
      { toolCalls: [{ id: 't1', name: 'read_account_pulse', args: {} }], text: null },
      { toolCalls: [], text: 'ok' },
    ];
    let i = 0;
    await runDashboardTurn(
      { ctx, message: 'תקרא את החשבון של studiopasha_fashion' },
      { callModel: async () => turns[i++] as any, runTool: runTool as any }
    );
    expect((runTool.mock.calls[0] as any)[2].accountId).toBe('A1');
  });
});

describe('the dashboard system prompt', () => {
  it('allows this account and forbids others', () => {
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('החשבון הזה');
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('חשבונות אחרים');
  });

  it('still forbids prices and still refuses to act', () => {
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('מחיר');
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('לא משנה');
  });

  it('requires routing through the validated tool', () => {
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('route_to_screen');
  });
});
