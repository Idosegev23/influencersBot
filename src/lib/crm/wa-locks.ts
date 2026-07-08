import { redisSetNx, redisDel } from '@/lib/redis';

/**
 * Per-agent mutex so a burst of voice notes can't race crm_agent_wa_state.
 * TTL >= the worker's maxDuration (300s) so the lock can't expire mid-job and let a
 * sibling in (the worker is killed at 300s, so its finally never double-releases).
 */
export async function acquireAgentLock(agentId: string, ttlSeconds = 300): Promise<boolean> {
  return redisSetNx(`wa:agent:${agentId}:lock`, '1', ttlSeconds);
}
export async function releaseAgentLock(agentId: string): Promise<void> {
  await redisDel(`wa:agent:${agentId}:lock`);
}
