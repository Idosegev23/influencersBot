import { runScanJob } from '@/lib/scraping/runScanJob';
import { createClient } from '@/lib/supabase/server';
import { saveState } from '@/lib/pipeline/state';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function igScanStep(ctx: StepContext): Promise<StepResult> {
  await runScanJob(ctx.jobId); // scrapes profile+posts+highlights+comments into DB
  if (!ctx.state.websiteUrl) {
    const supabase = await createClient();
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const fromBio = data?.config?.website_url;
    if (fromBio) { ctx.state.websiteUrl = fromBio; await saveState(ctx.jobId, ctx.state); }
  }
  return { status: 'advance' };
}
