export type PipelineStep =
  | 'create-account' | 'ig-scan' | 'transcribe' | 'site-discover'
  | 'site-crawl' | 'rag-ingest' | 'product-extract' | 'persona-build' | 'finalize';

export const STEP_ORDER: PipelineStep[] = [
  'create-account', 'ig-scan', 'transcribe', 'site-discover',
  'site-crawl', 'rag-ingest', 'product-extract', 'persona-build', 'finalize',
];

export const BATCH_SIZES: Record<PipelineStep, number> = {
  'create-account': 0, 'ig-scan': 0, 'transcribe': 5, 'site-discover': 0,
  'site-crawl': 15, 'rag-ingest': 20, 'product-extract': 20, 'persona-build': 0, 'finalize': 0,
};

export interface PipelineOptions {
  transcribe: boolean;
  maxPages: number | null; // null = all sitemap urls
  postsLimit: number;
  isDemo: boolean;
}

export interface PipelineState {
  currentStep: PipelineStep;
  counts: Record<string, { done: number; total: number }>;
  cursors: Record<string, number>;
  websiteUrl?: string;
  options: PipelineOptions;
}

export interface StepContext {
  jobId: string;
  accountId: string;
  username: string;
  step: PipelineStep;
  batch: number;
  state: PipelineState;
}

export function nextStep(step: PipelineStep): PipelineStep | null {
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null;
}
