-- Migration 048: get_coupons_with_partnerships now enforces date validity.
-- Date is authoritative (expired coupons are invisible even if is_active=true).
-- Mirrors COUPON_VALIDITY_WHERE_SQL in src/lib/coupons/active-filter.ts.
CREATE OR REPLACE FUNCTION public.get_coupons_with_partnerships(p_account_id UUID)
RETURNS TABLE (
  id UUID,
  code TEXT,
  description TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  brand_name TEXT,
  category TEXT,
  link TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.id,
    c.code,
    c.description,
    c.discount_type,
    c.discount_value,
    COALESCE(c.brand_name, p.brand_name) as brand_name,
    p.category,
    p.link
  FROM coupons c
  LEFT JOIN partnerships p ON c.partnership_id = p.id
  WHERE c.account_id = p_account_id
    AND c.is_active = true
    AND (c.start_date IS NULL OR c.start_date <= now())
    AND (c.end_date IS NULL OR c.end_date >= now())
  ORDER BY c.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_coupons_with_partnerships(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coupons_with_partnerships(UUID) TO anon;

COMMENT ON FUNCTION public.get_coupons_with_partnerships IS 'Active + in-date coupons with brand info (date-authoritative)';
