import { createClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/utils';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function createAccountStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('accounts')
    .select('id, config, security_config')
    .eq('id', ctx.accountId)
    .single();
  const baseConfig = existing?.config ?? {};
  const mergedConfig = {
    ...baseConfig,
    username: ctx.username,
    display_name: baseConfig.display_name || ctx.username,
    isDemo: ctx.state.options.isDemo,
  };
  if (!existing) {
    await supabase.from('accounts').insert({ id: ctx.accountId, type: 'creator', config: mergedConfig });
  } else {
    await supabase.from('accounts').update({ config: mergedConfig }).eq('id', ctx.accountId); // merge, never overwrite
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
