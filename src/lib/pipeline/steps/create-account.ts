import { createClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/utils';
import type { StepContext } from '../types';
import type { StepResult } from './index';
import { withFreshCopilot } from '@/lib/copilot/preserve-copilot';

export async function createAccountStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('accounts')
    .select('id, config, security_config')
    .eq('id', ctx.accountId)
    .single();
  const baseConfig = existing?.config ?? {};
  if (!existing) {
    // A partner console creates the account before starting the scan and deletes it
    // again when the create fails. A job that outlived that rollback must not
    // resurrect a half-made account outside the partner's control.
    const { data: job } = await supabase.from('scan_jobs').select('requested_by').eq('id', ctx.jobId).maybeSingle();
    if (typeof job?.requested_by === 'string' && job.requested_by.startsWith('partner:')) {
      return { status: 'failed', error: 'account_missing' };
    }
  }
  const mergedConfig = {
    ...baseConfig,
    // Never replace an existing username: it is the account's public slug (a partner
    // console sets it before the scan), and ctx.username is only the scan anchor (the
    // website host when there is no Instagram handle), which may be another account's.
    username: baseConfig.username || ctx.username,
    display_name: baseConfig.display_name || ctx.username,
    isDemo: ctx.state.options.isDemo,
  };
  // Only write the top-level `language` column when the caller explicitly set it,
  // so a re-scan that omits language never clobbers an account's existing language
  // (and a first insert without it falls back to the DB default 'he').
  const lang = ctx.state.options.language;
  if (!existing) {
    await supabase
      .from('accounts')
      .insert({ id: ctx.accountId, type: 'creator', config: mergedConfig, ...(lang ? { language: lang } : {}) });
  } else {
    await supabase
      .from('accounts')
      .update({ config: await withFreshCopilot(supabase, ctx.accountId, mergedConfig), ...(lang ? { language: lang } : {}) })
      .eq('id', ctx.accountId); // merge, never overwrite
  }
  if (!existing?.security_config?.admin_password_hash) {
    const hash = await hashPassword('123456');
    await supabase
      .from('accounts')
      .update({ security_config: { ...(existing?.security_config ?? {}), admin_password_hash: hash } })
      .eq('id', ctx.accountId);
  }
  return { status: 'advance' };
}
