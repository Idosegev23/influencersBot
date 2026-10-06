/**
 * Accounts that enforce per-agent login, each with its own branded login
 * page. Client-safe (no server imports) so pages can route with it.
 */
export const BRANDED_AGENT_LOGIN: Record<string, string> = {
  'labeaute.israel': '/labeaute/login',
  argania_group: '/argania/login',
  studiopasha_fashion: '/studiopasha/login',
};

export function agentLoginPath(accountUsername: string): string {
  return BRANDED_AGENT_LOGIN[accountUsername] || `/influencer/${accountUsername}`;
}
