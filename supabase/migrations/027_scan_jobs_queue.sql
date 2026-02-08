-- ==================================================
-- Migration 027: Scan Jobs Queue System
-- ==================================================
-- תיאור: תור משימות לסריקת Instagram עם ScrapeCreators
-- תאריך: 2026-02-03
-- ==================================================

-- ============================================
-- 1. scan_jobs - תור סריקות
-- ============================================
CREATE TABLE IF NOT EXISTS public.scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Platform & Target
  platform TEXT NOT NULL DEFAULT 'instagram' CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  username TEXT NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Job Status
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',      -- ממתין בתור
    'running',     -- רץ כרגע
    'succeeded',   -- הצליח
    'failed',      -- נכשל
    'cancelled'    -- בוטל
  )),
  
  -- Priority & Scheduling
  priority INTEGER DEFAULT 100, -- Higher = more important
  requested_by TEXT, -- Admin email or user ID
  
  -- Retry Logic
  attempt INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_run_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Locking (single job at a time)
  locked_at TIMESTAMPTZ,
  locked_by TEXT, -- Worker identifier
  
  -- Timing
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  
  -- Error Handling
  error_code TEXT, -- HTTP_429, HTTP_AUTH_FAILED, TIMEOUT, etc.
  error_message TEXT,
  
  -- Results Summary
  result_summary JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "profile": true,
  --   "posts_count": 50,
  --   "comments_count": 150,
  --   "highlights_count": 8,
  --   "stories_count": 3,
  --   "websites_crawled": 2,
  --   "transcripts_count": 12
  -- }
  
  -- Scrape Configuration
  config JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "posts_limit": 50,
  --   "comments_per_post": 3,
  --   "max_website_pages": 10,
  --   "samples_per_highlight": 2
  -- }
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Main query index: get next job to run
CREATE INDEX idx_scan_jobs_next_run 
  ON public.scan_jobs(status, next_run_at, priority DESC)
  WHERE status = 'queued';

-- Find jobs by username
CREATE INDEX idx_scan_jobs_username 
  ON public.scan_jobs(username, created_at DESC);

-- Find jobs by account
CREATE INDEX idx_scan_jobs_account 
  ON public.scan_jobs(account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- Find running jobs (for monitoring)
CREATE INDEX idx_scan_jobs_running 
  ON public.scan_jobs(locked_at)
  WHERE status = 'running';

-- Find failed jobs for retry
CREATE INDEX idx_scan_jobs_failed 
  ON public.scan_jobs(finished_at DESC)
  WHERE status = 'failed';

-- ============================================
-- Helper Functions
-- ============================================

-- Function: Get next job to run
CREATE OR REPLACE FUNCTION get_next_scan_job(worker_id TEXT)
RETURNS UUID AS $$
DECLARE
  job_id UUID;
BEGIN
  -- Lock and get next job
  SELECT id INTO job_id
  FROM public.scan_jobs
  WHERE status = 'queued'
    AND next_run_at <= NOW()
  ORDER BY priority DESC, next_run_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  -- Update job status if found
  IF job_id IS NOT NULL THEN
    UPDATE public.scan_jobs
    SET 
      status = 'running',
      locked_at = NOW(),
      locked_by = worker_id,
      started_at = COALESCE(started_at, NOW()),
      attempt = attempt + 1,
      updated_at = NOW()
    WHERE id = job_id;
  END IF;
  
  RETURN job_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark job as succeeded
CREATE OR REPLACE FUNCTION mark_scan_job_succeeded(
  job_id UUID,
  summary JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.scan_jobs
  SET 
    status = 'succeeded',
    finished_at = NOW(),
    result_summary = summary,
    updated_at = NOW()
  WHERE id = job_id;
  
  -- Update account last_scanned_at if job has account_id
  UPDATE public.accounts
  SET updated_at = NOW()
  WHERE id = (SELECT account_id FROM public.scan_jobs WHERE id = job_id);
END;
$$ LANGUAGE plpgsql;

-- Function: Mark job as failed
CREATE OR REPLACE FUNCTION mark_scan_job_failed(
  job_id UUID,
  err_code TEXT,
  err_message TEXT
)
RETURNS VOID AS $$
DECLARE
  job_record RECORD;
  is_retryable BOOLEAN;
BEGIN
  -- Get job details
  SELECT * INTO job_record
  FROM public.scan_jobs
  WHERE id = job_id;
  
  -- Determine if error is retryable
  is_retryable := err_code IN ('HTTP_429', 'HTTP_SERVER_ERROR', 'TIMEOUT', 'NETWORK');
  
  -- Check if we should retry
  IF is_retryable AND job_record.attempt < job_record.max_attempts THEN
    -- Schedule retry with exponential backoff
    UPDATE public.scan_jobs
    SET 
      status = 'queued',
      error_code = err_code,
      error_message = err_message,
      locked_at = NULL,
      locked_by = NULL,
      next_run_at = NOW() + (INTERVAL '2 seconds' * POWER(2, job_record.attempt)),
      updated_at = NOW()
    WHERE id = job_id;
  ELSE
    -- Mark as permanently failed
    UPDATE public.scan_jobs
    SET 
      status = 'failed',
      error_code = err_code,
      error_message = err_message,
      finished_at = NOW(),
      updated_at = NOW()
    WHERE id = job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Release stale locks (jobs stuck in "running" for too long)
CREATE OR REPLACE FUNCTION release_stale_scan_jobs(max_lock_duration_minutes INTEGER DEFAULT 15)
RETURNS INTEGER AS $$
DECLARE
  released_count INTEGER;
BEGIN
  UPDATE public.scan_jobs
  SET 
    status = 'queued',
    locked_at = NULL,
    locked_by = NULL,
    error_message = 'Released due to stale lock',
    updated_at = NOW()
  WHERE status = 'running'
    AND locked_at < NOW() - (max_lock_duration_minutes || ' minutes')::INTERVAL;
  
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if username can be scanned (TTL check)
CREATE OR REPLACE FUNCTION can_scan_username(
  p_username TEXT,
  ttl_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  can_scan BOOLEAN,
  reason TEXT,
  last_scan TIMESTAMPTZ
) AS $$
DECLARE
  last_succeeded TIMESTAMPTZ;
BEGIN
  -- Find last successful scan
  SELECT finished_at INTO last_succeeded
  FROM public.scan_jobs
  WHERE username = p_username
    AND status = 'succeeded'
  ORDER BY finished_at DESC
  LIMIT 1;
  
  -- Check TTL
  IF last_succeeded IS NULL THEN
    RETURN QUERY SELECT TRUE, 'Never scanned'::TEXT, NULL::TIMESTAMPTZ;
  ELSIF last_succeeded < NOW() - (ttl_hours || ' hours')::INTERVAL THEN
    RETURN QUERY SELECT TRUE, 'TTL expired'::TEXT, last_succeeded;
  ELSE
    RETURN QUERY SELECT FALSE, 'Recently scanned'::TEXT, last_succeeded;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Automatic Timestamp Updates
-- ============================================

CREATE OR REPLACE FUNCTION update_scan_jobs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_scan_jobs_updated_at
BEFORE UPDATE ON public.scan_jobs
FOR EACH ROW
EXECUTE FUNCTION update_scan_jobs_timestamp();

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

-- Influencers can view their own scan jobs
CREATE POLICY "Influencers view own scan jobs"
  ON public.scan_jobs FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Influencers can create scan jobs for their own accounts
CREATE POLICY "Influencers create own scan jobs"
  ON public.scan_jobs FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "Service role manages scan jobs"
  ON public.scan_jobs FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE public.scan_jobs IS 'תור משימות לסריקת Instagram - מבטיח סריקה בודדת בכל רגע';
COMMENT ON COLUMN public.scan_jobs.priority IS 'עדיפות (100=רגיל, 200=גבוה, 50=נמוך)';
COMMENT ON COLUMN public.scan_jobs.locked_at IS 'זמן נעילה - מבטיח שרק worker אחד מעבד את ה-job';
COMMENT ON COLUMN public.scan_jobs.next_run_at IS 'מתי להריץ את ה-job (משמש ל-retry עם backoff)';
COMMENT ON COLUMN public.scan_jobs.error_code IS 'קוד שגיאה מובנה: HTTP_429, TIMEOUT, וכו';
