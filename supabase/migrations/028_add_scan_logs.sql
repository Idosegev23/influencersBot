-- ==================================================
-- Migration 028: Add Real-Time Logs to Scan Jobs
-- ==================================================
-- תיאור: הוספת עמודה ללוגים בזמן אמת לתצוגה ב-UI
-- תאריך: 2026-02-03
-- ==================================================

-- הוספת עמודת step_logs לטבלת scan_jobs
ALTER TABLE public.scan_jobs 
ADD COLUMN IF NOT EXISTS step_logs JSONB DEFAULT '[]'::jsonb;

-- דוגמה למבנה ה-logs:
-- [
--   {
--     "step": "profile",
--     "status": "running",
--     "progress": 5,
--     "message": "סורק פרופיל...",
--     "timestamp": "2026-02-03T10:00:00Z"
--   },
--   {
--     "step": "profile",
--     "status": "completed",
--     "progress": 10,
--     "message": "✓ פרופיל: 50,000 עוקבים",
--     "timestamp": "2026-02-03T10:00:05Z"
--   }
-- ]

COMMENT ON COLUMN public.scan_jobs.step_logs IS 'Real-time progress logs for UI display';
