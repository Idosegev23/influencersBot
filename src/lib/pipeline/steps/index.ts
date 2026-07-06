import type { PipelineStep, StepContext } from '../types';
import { createAccountStep } from './create-account';
import { igScanStep } from './ig-scan';
import { transcribeStep } from './transcribe';
import { siteDiscoverStep } from './site-discover';
import { siteCrawlStep } from './site-crawl';

export type StepResult =
  | { status: 'advance' }
  | { status: 're-enqueue'; delaySeconds?: number }
  | { status: 'failed'; error: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

const notImplemented: StepHandler = async () => ({ status: 'advance' }); // replaced in Tasks 8-14

export const STEP_HANDLERS: Record<PipelineStep, StepHandler> = {
  'create-account': createAccountStep,
  'ig-scan': igScanStep,
  'transcribe': transcribeStep,
  'site-discover': siteDiscoverStep,
  'site-crawl': siteCrawlStep,
  'rag-ingest': notImplemented,
  'product-extract': notImplemented,
  'persona-build': notImplemented,
  'finalize': notImplemented,
};
