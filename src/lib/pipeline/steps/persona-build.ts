import { createClient } from '@/lib/supabase/server';
import { preprocessInstagramData } from '@/lib/scraping/preprocessing';
import { buildPersonaWithGemini, savePersonaToDatabase } from '@/lib/ai/gemini-persona-builder';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * Persona-build step — self-contained.
 *
 * The old version read a pre-existing `chatbot_persona.preprocessing_data` and
 * bailed if absent. But this pipeline's `ig-scan` is `runScanJob` only, and the
 * `preprocessing_data`-producing `preprocessInstagramData` used to live inside
 * the `processAccountContent` call that `rag-ingest` no longer makes — so nothing
 * produced it and persona was never built (Carolina acceptance run: persona=0).
 *
 * Now we run the preprocess (analyses scanned posts + transcriptions) and then
 * build + save the persona in one step, mirroring `setup-account.ts` step 6.
 */
export async function personaBuildStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();

  const preprocessedData = await preprocessInstagramData(ctx.accountId);

  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', ctx.accountId)
    .single();

  const cfg = account?.config as any;
  const profileData = cfg
    ? {
        username: cfg.username,
        full_name: cfg.display_name || cfg.username,
        bio: cfg.bio,
        followers_count: cfg.followers_count,
        category: cfg.category,
      }
    : undefined;

  const newPersona = await buildPersonaWithGemini(preprocessedData, profileData);

  await savePersonaToDatabase(
    supabase,
    ctx.accountId,
    newPersona,
    preprocessedData,
    JSON.stringify(newPersona),
  );

  return { status: 'advance' };
}
