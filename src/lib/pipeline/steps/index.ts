import type { PipelineStep, StepContext } from '../types';
import { createAccountStep } from './create-account';
import { igScanStep } from './ig-scan';
import { transcribeStep } from './transcribe';
import { siteDiscoverStep } from './site-discover';
import { siteCrawlStep } from './site-crawl';
import { ragIngestStep } from './rag-ingest';
import { productExtractStep } from './product-extract';
import { personaBuildStep } from './persona-build';
import { finalizeStep } from './finalize';

export type StepResult =
  | { status: 'advance' }
  | { status: 're-enqueue'; delaySeconds?: number }
  | { status: 'failed'; error: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

export const STEP_HANDLERS: Record<PipelineStep, StepHandler> = {
  'create-account': createAccountStep,
  'ig-scan': igScanStep,
  'transcribe': transcribeStep,
  'site-discover': siteDiscoverStep,
  'site-crawl': siteCrawlStep,
  'rag-ingest': ragIngestStep,
  'product-extract': productExtractStep,
  'persona-build': personaBuildStep,
  'finalize': finalizeStep,
};
