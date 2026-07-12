import { runScanJob } from '@/lib/scraping/runScanJob';
import { createClient } from '@/lib/supabase/server';
import { saveState } from '@/lib/pipeline/state';
import type { StepContext } from '../types';
import { hasInstagram, enrichSkips, type StepResult } from './index';

export async function igScanStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'instagram')) return { status: 'advance' }; // enriching a different source
  if (!hasInstagram(ctx)) return { status: 'advance' }; // website-only account: nothing to scrape
  await runScanJob(ctx.jobId); // scrapes profile+posts+highlights+comments into DB

  const supabase = await createClient();
  if (!ctx.state.websiteUrl) {
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const fromBio = data?.config?.website_url;
    if (fromBio) { ctx.state.websiteUrl = fromBio; await saveState(ctx.jobId, ctx.state); }
  }

  // No-content guard: if the scrape found zero posts and there is no website to
  // fall back on, the handle is wrong/private (or the scrape was rate-limited).
  // Fail with a clear message instead of silently building an empty persona.
  if (!ctx.state.websiteUrl) {
    const { count } = await supabase
      .from('instagram_posts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);
    if (!count) {
      return { status: 'failed', error: `לא נמצא תוכן לחשבון @${ctx.username} — בדוק את שם המשתמש או נסה שוב` };
    }
  }

  return { status: 'advance' };
}
