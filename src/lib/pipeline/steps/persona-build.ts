import { createClient } from '@/lib/supabase/server';
import { buildPersonaWithGemini, savePersonaToDatabase } from '@/lib/ai/gemini-persona-builder';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * Persona-build step. Mirrors `setup-account.ts` step 6 (persona rebuild with
 * GPT-5.4, Gemini 3.1 Pro fallback): reads the `preprocessing_data` that RAG
 * ingestion produced, rebuilds the persona, and saves it back.
 *
 * If there is no `preprocessing_data` yet, the initial persona from scanning
 * stands — we skip rather than fail.
 */
export async function personaBuildStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('preprocessing_data, name')
    .eq('account_id', ctx.accountId)
    .single();

  if (!persona?.preprocessing_data) {
    // No preprocessing_data — keep the initial persona from the scan step.
    return { status: 'advance' };
  }

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

  const newPersona = await buildPersonaWithGemini(persona.preprocessing_data, profileData);

  await savePersonaToDatabase(
    supabase,
    ctx.accountId,
    newPersona,
    persona.preprocessing_data,
    JSON.stringify(newPersona),
  );

  return { status: 'advance' };
}
