-- ==================================================
-- Migration 016: Add Copy Tracking for Coupons
-- ==================================================
-- תיאור: הוספת tracking להעתקות קופון (לפני שימוש)
-- תאריך: 2026-01-18
-- ==================================================

-- Add copy_count column to coupons
ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS copy_count INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_coupons_copy_count 
ON public.coupons(copy_count) 
WHERE copy_count > 0;

-- Create coupon_copies tracking table (optional - for detailed tracking)
CREATE TABLE IF NOT EXISTS public.coupon_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  
  -- Who copied
  user_identifier TEXT, -- phone, email, anonymous ID
  is_follower BOOLEAN DEFAULT false,
  
  -- When & Where
  copied_at TIMESTAMPTZ DEFAULT NOW(),
  copied_from TEXT, -- 'chatbot', 'web', 'instagram'
  
  -- Device info (optional)
  user_agent TEXT,
  ip_address TEXT,
  
  -- Did they convert?
  converted BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_coupon_copies_coupon ON public.coupon_copies(coupon_id);
CREATE INDEX idx_coupon_copies_copied_at ON public.coupon_copies(copied_at DESC);
CREATE INDEX idx_coupon_copies_converted ON public.coupon_copies(converted) WHERE converted = false;

-- RLS Policies
ALTER TABLE public.coupon_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their coupon copies"
ON public.coupon_copies
FOR SELECT
TO authenticated
USING (
  coupon_id IN (
    SELECT id FROM public.coupons
    WHERE account_id IN (
      SELECT id FROM public.accounts
      WHERE owner_user_id = auth.uid()
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "System can insert coupon copies"
ON public.coupon_copies
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization

-- Function to increment copy count
CREATE OR REPLACE FUNCTION public.increment_coupon_copy_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.coupons
  SET copy_count = copy_count + 1,
      updated_at = NOW()
  WHERE id = NEW.coupon_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-increment copy count
CREATE TRIGGER trigger_increment_coupon_copy_count
AFTER INSERT ON public.coupon_copies
FOR EACH ROW
EXECUTE FUNCTION public.increment_coupon_copy_count();

-- Function to mark copy as converted when used
CREATE OR REPLACE FUNCTION public.mark_copy_as_converted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to find matching copy event (same user, same coupon, not yet converted)
  UPDATE public.coupon_copies
  SET converted = true,
      converted_at = NOW()
  WHERE coupon_id = (
    SELECT id FROM public.coupons WHERE id = NEW.coupon_id
  )
  AND user_identifier = NEW.customer_email -- or NEW.customer_id
  AND converted = false
  AND copied_at < NEW.used_at
  ORDER BY copied_at DESC
  LIMIT 1;
  
  RETURN NEW;
END;
$$;

-- Trigger to mark copy as converted
CREATE TRIGGER trigger_mark_copy_converted
AFTER INSERT ON public.coupon_usages
FOR EACH ROW
EXECUTE FUNCTION public.mark_copy_as_converted();

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Copy tracking added to coupons!';
  RAISE NOTICE '✅ copy_count column added';
  RAISE NOTICE '✅ coupon_copies table created';
  RAISE NOTICE '✅ Triggers and functions created';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Usage:';
  RAISE NOTICE '1. כשמישהו מעתיק קופון -> INSERT INTO coupon_copies';
  RAISE NOTICE '2. Trigger מעדכן את copy_count אוטומטית';
  RAISE NOTICE '3. כשמישהו משתמש בקופון -> Trigger מסמן converted=true';
END$$;
