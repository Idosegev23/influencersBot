-- Migration 022: Scraping Jobs Progress Tracking
-- טבלה למעקב אחר התקדמות סריקה (בגלל מגבלות Vercel Serverless 800s)

-- ============================================
-- scraping_jobs - מעקב אחר תהליך סריקה
-- ============================================

CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES influencer_accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Job status
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  
  -- Progress tracking
  current_step INTEGER DEFAULT 0 CHECK (current_step >= 0 AND current_step <= 7),
  total_steps INTEGER DEFAULT 7,
  
  -- Per-step status (JSONB array)
  step_statuses JSONB DEFAULT '[]'::jsonb,
  /* Example structure:
  [
    {"step": 1, "name": "Instagram Posts", "status": "completed", "duration": 580, "result": {...}},
    {"step": 2, "name": "Comments", "status": "running", "startedAt": "..."},
    {"step": 3, "name": "Profile", "status": "pending"}
  ]
  */
  
  -- Results from each step
  results JSONB DEFAULT '{}'::jsonb,
  /* Example structure:
  {
    "step1": {"postsCount": 487, "oldestPost": "2024-01-01"},
    "step2": {"commentsCount": 7234},
    "step3": {"followers": 125000},
    ...
  }
  */
  
  -- Error tracking
  error_message TEXT,
  error_step INTEGER,
  retry_count INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_completion TIMESTAMPTZ,
  
  -- Statistics
  total_posts_scraped INTEGER DEFAULT 0,
  total_comments_scraped INTEGER DEFAULT 0,
  total_hashtags_tracked INTEGER DEFAULT 0,
  
  -- Metadata
  triggered_by TEXT, -- 'manual', 'cron', 'auto'
  job_type TEXT DEFAULT 'full_rebuild' CHECK (job_type IN ('full_rebuild', 'incremental_update')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for scraping_jobs
-- ============================================

CREATE INDEX idx_scraping_jobs_account ON scraping_jobs(account_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_created ON scraping_jobs(created_at DESC);
CREATE INDEX idx_scraping_jobs_account_status ON scraping_jobs(account_id, status);

-- Index for finding running jobs
CREATE INDEX idx_scraping_jobs_running 
ON scraping_jobs(account_id, status, started_at) 
WHERE status = 'running';

-- Index for finding recent completed jobs
CREATE INDEX idx_scraping_jobs_completed 
ON scraping_jobs(account_id, completed_at DESC) 
WHERE status = 'completed';

-- ============================================
-- Trigger to update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_scraping_job_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_scraping_job_timestamp
BEFORE UPDATE ON scraping_jobs
FOR EACH ROW
EXECUTE FUNCTION update_scraping_job_timestamp();

-- ============================================
-- Trigger to set estimated completion
-- ============================================

CREATE OR REPLACE FUNCTION set_estimated_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- If job just started, estimate ~30 minutes for full rebuild
  IF NEW.status = 'running' AND OLD.status = 'pending' AND NEW.job_type = 'full_rebuild' THEN
    NEW.estimated_completion := NOW() + INTERVAL '30 minutes';
  END IF;
  
  -- If incremental update, estimate ~2 minutes
  IF NEW.status = 'running' AND OLD.status = 'pending' AND NEW.job_type = 'incremental_update' THEN
    NEW.estimated_completion := NOW() + INTERVAL '2 minutes';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_estimated_completion
BEFORE UPDATE ON scraping_jobs
FOR EACH ROW
WHEN (NEW.status = 'running')
EXECUTE FUNCTION set_estimated_completion();

-- ============================================
-- Helper function to create new scraping job
-- ============================================

CREATE OR REPLACE FUNCTION create_scraping_job(
  p_account_id UUID,
  p_job_type TEXT DEFAULT 'full_rebuild',
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_step_statuses JSONB;
BEGIN
  -- Initialize step statuses
  v_step_statuses := jsonb_build_array(
    jsonb_build_object('step', 1, 'name', 'Instagram Posts', 'status', 'pending'),
    jsonb_build_object('step', 2, 'name', 'Comments', 'status', 'pending'),
    jsonb_build_object('step', 3, 'name', 'Profile', 'status', 'pending'),
    jsonb_build_object('step', 4, 'name', 'Hashtags', 'status', 'pending'),
    jsonb_build_object('step', 5, 'name', 'Search', 'status', 'pending'),
    jsonb_build_object('step', 6, 'name', 'Preprocessing', 'status', 'pending'),
    jsonb_build_object('step', 7, 'name', 'Gemini Persona', 'status', 'pending')
  );
  
  -- Create the job
  INSERT INTO scraping_jobs (
    account_id,
    status,
    step_statuses,
    job_type,
    triggered_by
  ) VALUES (
    p_account_id,
    'pending',
    v_step_statuses,
    p_job_type,
    p_triggered_by
  )
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_scraping_job IS 'יוצר job חדש עם 7 שלבים initialized';

-- ============================================
-- Helper function to update job step
-- ============================================

CREATE OR REPLACE FUNCTION update_job_step(
  p_job_id UUID,
  p_step INTEGER,
  p_status TEXT,
  p_result JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_step_statuses JSONB;
  v_step_obj JSONB;
  v_idx INTEGER;
BEGIN
  -- Get current step_statuses
  SELECT step_statuses INTO v_step_statuses
  FROM scraping_jobs
  WHERE id = p_job_id;
  
  -- Find the step index (0-based)
  v_idx := p_step - 1;
  
  -- Build updated step object
  v_step_obj := jsonb_build_object(
    'step', p_step,
    'name', v_step_statuses->v_idx->>'name',
    'status', p_status
  );
  
  -- Add timestamps
  IF p_status = 'running' THEN
    v_step_obj := v_step_obj || jsonb_build_object('startedAt', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  ELSIF p_status IN ('completed', 'failed') THEN
    v_step_obj := v_step_obj || jsonb_build_object('completedAt', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    
    -- Calculate duration if we have startedAt
    IF v_step_statuses->v_idx->'startedAt' IS NOT NULL THEN
      v_step_obj := v_step_obj || jsonb_build_object(
        'duration', 
        EXTRACT(EPOCH FROM (NOW() - (v_step_statuses->v_idx->>'startedAt')::TIMESTAMPTZ))
      );
    END IF;
  END IF;
  
  -- Add result if provided
  IF p_result IS NOT NULL THEN
    v_step_obj := v_step_obj || jsonb_build_object('result', p_result);
  END IF;
  
  -- Add error if provided
  IF p_error_message IS NOT NULL THEN
    v_step_obj := v_step_obj || jsonb_build_object('error', p_error_message);
  END IF;
  
  -- Update the step in array
  v_step_statuses := jsonb_set(v_step_statuses, ARRAY[v_idx::text], v_step_obj);
  
  -- Update the job
  UPDATE scraping_jobs
  SET 
    step_statuses = v_step_statuses,
    current_step = CASE 
      WHEN p_status = 'completed' THEN p_step
      WHEN p_status = 'running' THEN p_step
      ELSE current_step
    END,
    status = CASE
      WHEN p_status = 'failed' THEN 'failed'
      WHEN p_status = 'completed' AND p_step = 7 THEN 'completed'
      WHEN p_status = 'running' THEN 'running'
      ELSE status
    END,
    error_message = COALESCE(p_error_message, error_message),
    error_step = CASE WHEN p_status = 'failed' THEN p_step ELSE error_step END,
    started_at = CASE 
      WHEN started_at IS NULL AND p_status = 'running' THEN NOW()
      ELSE started_at
    END,
    completed_at = CASE
      WHEN p_status = 'completed' AND p_step = 7 THEN NOW()
      WHEN p_status = 'failed' THEN NOW()
      ELSE completed_at
    END
  WHERE id = p_job_id;
  
  -- Store result in results object
  IF p_result IS NOT NULL THEN
    UPDATE scraping_jobs
    SET results = results || jsonb_build_object('step' || p_step::text, p_result)
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_job_step IS 'מעדכן מצב שלב בודד ב-job';

-- ============================================
-- Helper function to get job progress
-- ============================================

CREATE OR REPLACE FUNCTION get_job_progress(p_job_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_job RECORD;
  v_progress JSONB;
BEGIN
  SELECT * INTO v_job
  FROM scraping_jobs
  WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_progress := jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'currentStep', v_job.current_step,
    'totalSteps', v_job.total_steps,
    'progress', ROUND((v_job.current_step::DECIMAL / v_job.total_steps * 100)::NUMERIC, 2),
    'stepStatuses', v_job.step_statuses,
    'startedAt', v_job.started_at,
    'estimatedCompletion', v_job.estimated_completion,
    'completedAt', v_job.completed_at,
    'errorMessage', v_job.error_message
  );
  
  RETURN v_progress;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_job_progress IS 'מחזיר מידע מלא על התקדמות job';

-- ============================================
-- Enable RLS (Row Level Security)
-- ============================================

ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Influencers can view their own jobs
CREATE POLICY "Influencers can view their own scraping jobs"
  ON scraping_jobs FOR SELECT
  USING (account_id IN (
    SELECT id FROM influencer_accounts WHERE user_id = auth.uid()
  ));

-- Service role can do everything
CREATE POLICY "Service role can manage all scraping jobs"
  ON scraping_jobs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE scraping_jobs IS 'מעקב אחר התקדמות סריקה בארכיטקטורת Step-by-Step (בגלל Vercel 800s timeout)';
COMMENT ON COLUMN scraping_jobs.step_statuses IS 'מערך JSON עם סטטוס כל אחד מ-7 השלבים';
COMMENT ON COLUMN scraping_jobs.results IS 'תוצאות מכל שלב (posts count, comments count, וכו)';
COMMENT ON COLUMN scraping_jobs.job_type IS 'full_rebuild = סריקה מלאה, incremental_update = רק פוסטים חדשים';
