/**
 * Surface an ASYNC pipeline failure back to the onboarding wizard.
 *
 * `/api/onboard/[token]/start` reverts its status claim only when startPipeline
 * fails SYNCHRONOUSLY. A job that dies mid-pipeline — a bad website URL killing
 * site-discover 17 minutes later — left `onboarding.status` on 'scanning' forever,
 * so the wizard polled a screen that never changed and never showed an error.
 *
 * Best-effort by design: this runs inside the step runner's failure path, and a
 * problem writing the status must never mask the original pipeline error.
 */

import { supabase } from '@/lib/supabase';

/** Statuses from which a running scan can still fail. */
const FAILABLE = ['starting', 'scanning'];

export async function markOnboardingFailed(accountId: string | null, error: string): Promise<void> {
  if (!accountId) return;

  try {
    const { data } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('id', accountId)
      .maybeSingle();

    const config = (data as any)?.config;
    const ob = config?.onboarding;

    // The nightly cron re-scans LIVE accounts through this same failure path. Only an
    // account actually mid-onboarding may be moved to 'failed' — a failed re-scan must
    // not reopen a finished account's wizard.
    if (!ob || !FAILABLE.includes(ob.status)) return;

    await supabase
      .from('accounts')
      .update({ config: { ...config, onboarding: { ...ob, status: 'failed', error } } })
      .eq('id', accountId);
  } catch (e) {
    console.warn('[onboarding] failed to record scan failure', e);
  }
}
