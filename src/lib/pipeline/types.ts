export type PipelineStep =
  | 'create-account' | 'ig-scan' | 'transcribe' | 'youtube-scan' | 'tiktok-scan' | 'site-discover'
  | 'site-crawl' | 'rag-ingest' | 'product-extract' | 'persona-build' | 'finalize';

export const STEP_ORDER: PipelineStep[] = [
  'create-account', 'ig-scan', 'transcribe', 'youtube-scan', 'tiktok-scan', 'site-discover',
  'site-crawl', 'rag-ingest', 'product-extract', 'persona-build', 'finalize',
];

export const BATCH_SIZES: Record<PipelineStep, number> = {
  'create-account': 0, 'ig-scan': 0, 'transcribe': 5, 'youtube-scan': 0, 'tiktok-scan': 0, 'site-discover': 0,
  'site-crawl': 15, 'rag-ingest': 20, 'product-extract': 20, 'persona-build': 0, 'finalize': 0,
};

export interface PipelineOptions {
  transcribe: boolean;
  maxPages: number | null; // null = all sitemap urls
  postsLimit: number;
  isDemo: boolean;
  language?: 'he' | 'en'; // account output language: dashboard + chat + widget + persona. Default 'he'. Written to accounts.language in create-account.
  archetype?: string; // brand | influencer | service_provider | ... (applied in finalize)
  scanMode?: 'quote' | 'full'; // quote = bounded pre-sales demo scan; undefined/full = current behaviour
  categories?: { pathPattern: string; cap: number }[]; // selected path slices for quote mode; undefined = full scope
  youtube?: string; // YouTube channel URL or @handle (optional extra source)
  tiktok?: string;  // TikTok @handle or URL (optional extra source)
  hasIg?: boolean;  // true = `username` is a real IG handle to scrape (even if it equals the domain, e.g. @buyme.co.il); false = domain/social anchor only
  // Incremental enrichment: when set, ONLY these sources are (re)scraped; the other
  // scrape steps skip, while rag-ingest / persona-build / finalize still run so the
  // new content folds into the existing account data. Undefined = full scan.
  enrichSources?: ('instagram' | 'website' | 'youtube' | 'tiktok')[];
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
