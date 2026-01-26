-- ==================================================
-- Migration 014: Calendar Integration
-- ==================================================
-- תיאור: סנכרון דו-כיווני עם Google Calendar
-- תאריך: 2026-01-18
-- ==================================================

-- Table: calendar_connections
-- חיבור של משתמש ל-Google Calendar
CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Google OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  
  -- Calendar settings
  calendar_id TEXT NOT NULL DEFAULT 'primary', -- Google Calendar ID
  calendar_name TEXT,
  sync_enabled BOOLEAN DEFAULT true,
  sync_direction TEXT DEFAULT 'both' CHECK (sync_direction IN ('to_calendar', 'from_calendar', 'both')),
  
  -- Sync status
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_error TEXT,
  
  -- Metadata
  scopes TEXT[] DEFAULT ARRAY['https://www.googleapis.com/auth/calendar.events'],
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: calendar_events
-- מפה בין events במערכת שלנו לevents ב-Google Calendar
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  calendar_connection_id UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  
  -- Our entity
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'partnership', 'invoice', 'meeting', 'external')),
  entity_id UUID, -- Can be NULL for external events
  
  -- Google Calendar
  google_event_id TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL,
  
  -- Event details (cached from Google)
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT false,
  location TEXT,
  
  -- Sync status
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'deleted')),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  google_event_data JSONB DEFAULT '{}', -- Full Google event object
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(calendar_connection_id, google_event_id)
);

-- Table: calendar_sync_log
-- לוג של כל פעולות הסנכרון
CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_connection_id UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  
  -- Sync details
  sync_type TEXT NOT NULL CHECK (sync_type IN ('manual', 'auto', 'webhook')),
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('to_calendar', 'from_calendar', 'both')),
  
  -- Results
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  events_created INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_deleted INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  
  -- Details
  error_message TEXT,
  details JSONB DEFAULT '{}',
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ==================================================
-- Indexes for Performance
-- ==================================================

CREATE INDEX idx_calendar_connections_user ON public.calendar_connections(user_id);
CREATE INDEX idx_calendar_connections_account ON public.calendar_connections(account_id);
CREATE INDEX idx_calendar_connections_sync_enabled ON public.calendar_connections(sync_enabled) 
  WHERE sync_enabled = true;

CREATE INDEX idx_calendar_events_connection ON public.calendar_events(calendar_connection_id);
CREATE INDEX idx_calendar_events_entity ON public.calendar_events(entity_type, entity_id);
CREATE INDEX idx_calendar_events_google ON public.calendar_events(google_event_id, google_calendar_id);
CREATE INDEX idx_calendar_events_time ON public.calendar_events(start_time);
CREATE INDEX idx_calendar_events_pending ON public.calendar_events(sync_status) 
  WHERE sync_status = 'pending';

CREATE INDEX idx_calendar_sync_log_connection ON public.calendar_sync_log(calendar_connection_id);
CREATE INDEX idx_calendar_sync_log_started ON public.calendar_sync_log(started_at DESC);

-- ==================================================
-- RLS Policies
-- ==================================================

-- calendar_connections: Users see only their own
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their calendar connections"
ON public.calendar_connections
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their calendar connections"
ON public.calendar_connections
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their calendar connections"
ON public.calendar_connections
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their calendar connections"
ON public.calendar_connections
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- calendar_events: Users see events from their connections
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their calendar events"
ON public.calendar_events
FOR SELECT
TO authenticated
USING (
  calendar_connection_id IN (
    SELECT id FROM public.calendar_connections
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "System can manage calendar events"
ON public.calendar_events
FOR ALL
TO authenticated
USING (
  calendar_connection_id IN (
    SELECT id FROM public.calendar_connections
    WHERE user_id = auth.uid()
  )
);

-- calendar_sync_log: Read-only for users
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their sync logs"
ON public.calendar_sync_log
FOR SELECT
TO authenticated
USING (
  calendar_connection_id IN (
    SELECT id FROM public.calendar_connections
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "System can insert sync logs"
ON public.calendar_sync_log
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization

-- ==================================================
-- Helper Functions
-- ==================================================

-- Function: Check if token needs refresh
CREATE OR REPLACE FUNCTION public.needs_token_refresh(connection_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT token_expires_at INTO v_expires_at
  FROM public.calendar_connections
  WHERE id = connection_id;
  
  -- Refresh if expiring in next 5 minutes
  RETURN v_expires_at < (NOW() + INTERVAL '5 minutes');
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.needs_token_refresh TO authenticated;

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Calendar Integration tables created!';
  RAISE NOTICE '✅ calendar_connections, calendar_events, calendar_sync_log';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Helper functions created';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '1. Set up Google OAuth credentials';
  RAISE NOTICE '2. Create OAuth flow endpoints';
  RAISE NOTICE '3. Build sync logic';
  RAISE NOTICE '4. Set up webhook for real-time updates';
END$$;
