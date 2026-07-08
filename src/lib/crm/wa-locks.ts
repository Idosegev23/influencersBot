import { redisSetNx, redisDel } from '@/lib/redis';

/** Per-agent mutex so a burst of voice notes can't race crm_agent_wa_state. */
export async function acquireAgentLock(agentId: string, ttlSeconds = 120): Promise<boolean> {
  return redisSetNx(`wa:agent:${agentId}:lock`, '1', ttlSeconds);
}
export async function releaseAgentLock(agentId: string): Promise<void> {
  await redisDel(`wa:agent:${agentId}:lock`);
}
