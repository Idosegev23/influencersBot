/**
 * Browser-side account lookups.
 *
 * Mirrors getInfluencerByUsername's signature so client components can swap the
 * import without touching their logic — but this goes through /api/influencer/profile,
 * where the service role does the query and secrets are stripped before the response.
 *
 * Client components must never import from '@/lib/supabase': in the browser that
 * module falls back to the public anon key, which is what kept accounts,
 * chat_messages and friends readable by anyone.
 */

import type { Influencer } from '@/types';

export async function fetchInfluencerByUsername(username: string): Promise<Influencer | null> {
  try {
    const res = await fetch(`/api/influencer/profile?username=${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.influencer as Influencer) ?? null;
  } catch {
    return null;
  }
}
