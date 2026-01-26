-- ==================================================
-- Migration 012: Coupons & ROI Tracking
-- ==================================================
-- תיאור: מערכת קופונים ומדידת ROI לשת"פים
-- תאריך: 2026-01-18
-- ==================================================

-- Table: coupons
-- קופונים ייחודיים לכל שת"פ
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Coupon details
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
  discount_value NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  
  -- Terms
  min_purchase_amount NUMERIC(10, 2),
  max_discount_amount NUMERIC(10, 2),
  usage_limit INTEGER, -- NULL = unlimited
  usage_count INTEGER DEFAULT 0,
  
  -- Dates
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Tracking URL
  tracking_url TEXT, -- URL with UTM parameters
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: coupon_usages
-- מעקב אחר שימושים בקופון
CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  
  -- Purchase details
  order_id TEXT,
  order_amount NUMERIC(10, 2),
  discount_amount NUMERIC(10, 2),
  final_amount NUMERIC(10, 2),
  
  -- Customer info (optional, for privacy)
  customer_email TEXT,
  customer_id TEXT,
  
  -- Tracking
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  used_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: roi_tracking
-- מעקב אחר ROI של שת"פים
CREATE TABLE IF NOT EXISTS public.roi_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Investment (Cost)
  total_investment NUMERIC(10, 2) NOT NULL DEFAULT 0, -- כמה שילמו למשפיען
  
  -- Revenue Generated
  total_revenue NUMERIC(10, 2) DEFAULT 0, -- הכנסות שנוצרו מהשת"פ
  coupon_revenue NUMERIC(10, 2) DEFAULT 0, -- הכנסות דרך קופונים
  organic_revenue NUMERIC(10, 2) DEFAULT 0, -- הכנסות אורגניות (הערכה)
  
  -- Engagement Metrics
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  
  -- Calculated Metrics
  roi_percentage NUMERIC(10, 2) GENERATED ALWAYS AS (
    CASE 
      WHEN total_investment > 0 THEN 
        ((total_revenue - total_investment) / total_investment) * 100
      ELSE 0
    END
  ) STORED,
  
  conversion_rate NUMERIC(10, 2) GENERATED ALWAYS AS (
    CASE
      WHEN total_clicks > 0 THEN
        (total_conversions::NUMERIC / total_clicks) * 100
      ELSE 0
    END
  ) STORED,
  
  ctr NUMERIC(10, 2) GENERATED ALWAYS AS (
    CASE
      WHEN total_impressions > 0 THEN
        (total_clicks::NUMERIC / total_impressions) * 100
      ELSE 0
    END
  ) STORED,
  
  -- Dates
  tracking_start_date TIMESTAMPTZ,
  tracking_end_date TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================
-- Indexes for Performance
-- ==================================================

CREATE INDEX idx_coupons_partnership ON public.coupons(partnership_id);
CREATE INDEX idx_coupons_account ON public.coupons(account_id);
CREATE INDEX idx_coupons_code ON public.coupons(code) WHERE is_active = true;
CREATE INDEX idx_coupons_active_dates ON public.coupons(start_date, end_date) 
  WHERE is_active = true;

CREATE INDEX idx_coupon_usages_coupon ON public.coupon_usages(coupon_id);
CREATE INDEX idx_coupon_usages_used_at ON public.coupon_usages(used_at DESC);

CREATE INDEX idx_roi_tracking_partnership ON public.roi_tracking(partnership_id);
CREATE INDEX idx_roi_tracking_account ON public.roi_tracking(account_id);

-- ==================================================
-- RLS Policies
-- ==================================================

-- coupons: Users can see their own
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their coupons"
ON public.coupons
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "Users can insert their coupons"
ON public.coupons
FOR INSERT
TO authenticated
WITH CHECK (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their coupons"
ON public.coupons
FOR UPDATE
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

-- coupon_usages: Read-only for users, system writes
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their coupon usages"
ON public.coupon_usages
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

CREATE POLICY "System can insert coupon usages"
ON public.coupon_usages
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization

-- roi_tracking: Users can see their own
ALTER TABLE public.roi_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their ROI tracking"
ON public.roi_tracking
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "Users can manage their ROI tracking"
ON public.roi_tracking
FOR ALL
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

-- ==================================================
-- Helper Functions
-- ==================================================

-- Function to update coupon usage count
CREATE OR REPLACE FUNCTION public.increment_coupon_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.coupons
  SET usage_count = usage_count + 1,
      updated_at = NOW()
  WHERE id = NEW.coupon_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-increment coupon usage
CREATE TRIGGER trigger_increment_coupon_usage
AFTER INSERT ON public.coupon_usages
FOR EACH ROW
EXECUTE FUNCTION public.increment_coupon_usage();

-- Function to sync ROI metrics
CREATE OR REPLACE FUNCTION public.sync_roi_metrics(p_partnership_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon_revenue NUMERIC(10, 2);
  v_conversions INTEGER;
BEGIN
  -- Calculate coupon revenue
  SELECT COALESCE(SUM(cu.final_amount), 0), COUNT(*)
  INTO v_coupon_revenue, v_conversions
  FROM public.coupon_usages cu
  JOIN public.coupons c ON cu.coupon_id = c.id
  WHERE c.partnership_id = p_partnership_id;

  -- Update ROI tracking
  UPDATE public.roi_tracking
  SET 
    coupon_revenue = v_coupon_revenue,
    total_conversions = v_conversions,
    total_revenue = coupon_revenue + organic_revenue,
    last_synced_at = NOW(),
    updated_at = NOW()
  WHERE partnership_id = p_partnership_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.sync_roi_metrics TO authenticated;

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Coupons & ROI tracking tables created!';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Helper functions and triggers created';
END$$;
