import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { getLinkedInCompany, getLinkedInPosts } from '@/lib/scraping/linkedinScraper';
import type { StepContext } from '../types';
import { enrichSkips, type StepResult } from './index';

// posted_at is NOT NULL with no default.
function toPostedAt(iso?: string): string {
  if (iso && !Number.isNaN(Date.parse(iso))) return new Date(iso).toISOString();
  return new Date().toISOString();
}

/**
 * LinkedIn scan step. Adds a company's professional presence to the corpus:
 * the profile — description, slogan, founding year, headquarters, employee count
 * and the `specialties` list — plus roughly ten recent posts.
 *
 * For a trade association the profile is the valuable half. ABA's specialties
 * name its councils (Women in Buses, Bus Industry Safety Council, Hispanic
 * Motorcoach Council), which is precisely what a prospective member asks about
 * and which appears nowhere in its Instagram or Facebook captions.
 *
 * Posts are stored platform-tagged like every other source, so RAG and persona
 * pick them up unchanged. They carry NO engagement — see linkedinScraper's
 * header — which is why anything ranking channels by response has to leave
 * LinkedIn out rather than read its silence as zero.
 */
export async function linkedinScanStep(ctx: StepContext): Promise<StepResult> {
  if (enrichSkips(ctx, 'linkedin')) return { status: 'advance' }; // enriching a different source
  const page = ctx.state.options?.linkedin;
  if (!page) return { status: 'advance' };

  const supabase = await createClient();

  const company = await getLinkedInCompany(page);
  if (company) {
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const cfg: Record<string, any> = { ...(data?.config ?? {}) };
    cfg.linkedin = {
      id: company.id,
      name: company.name,
      url: company.url,
      description: company.description,
      slogan: company.slogan,
      industry: company.industry,
      type: company.type,
      size: company.size,
      founded: company.founded,
      headquarters: company.headquarters,
      followers: company.followers,
      employeeCount: company.employeeCount,
      specialties: company.specialties,
    };
    await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);
  }

  const posts = await getLinkedInPosts(page);
  await setCount(ctx.jobId, 'linkedin-scan', { done: 0, total: posts.length });

  let done = 0;
  for (const p of posts) {
    try {
      await supabase.from('instagram_posts').upsert(
        {
          account_id: ctx.accountId,
          platform: 'linkedin',
          shortcode: `li_${p.id}`,
          post_url: p.url || null,
          type: 'post',
          caption: p.text.slice(0, 5000),
          media_urls: [],
          // Left at the column defaults on purpose. LinkedIn gives no counts, and
          // writing 0 would be indistinguishable from a post nobody engaged with.
          posted_at: toPostedAt(p.publishedAt),
        },
        { onConflict: 'account_id,shortcode' },
      );
    } catch (e: any) {
      console.error(`[linkedin-scan] post ${p.id} failed:`, e?.message || e);
    }
    done++;
  }

  await setCount(ctx.jobId, 'linkedin-scan', { done, total: posts.length });
  return { status: 'advance' };
}
