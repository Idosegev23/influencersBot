import type { PipelineStep, StepContext } from '../types';
import { createAccountStep } from './create-account';

export type StepResult =
  | { status: 'advance' }
  | { status: 're-enqueue'; delaySeconds?: number }
  | { status: 'failed'; error: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

const notImplemented: StepHandler = async () => ({ status: 'advance' }); // replaced in Tasks 8-14

export const STEP_HANDLERS: Record<PipelineStep, StepHandler> = {
  'create-account': createAccountStep,
  'ig-scan': notImplemented,
  'transcribe': notImplemented,
  'site-discover': notImplemented,
  'site-crawl': notImplemented,
  'rag-ingest': notImplemented,
  'product-extract': notImplemented,
  'persona-build': notImplemented,
  'finalize': notImplemented,
};
