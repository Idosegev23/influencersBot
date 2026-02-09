-- Migration 031: RPC Function for Getting Coupons with Partnerships
-- שליפת קופונים עם מותגים - פתרון לבעיית nested select

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
    p.brand_name,
    p.category,
    p.link
  FROM coupons c
  LEFT JOIN partnerships p ON c.partnership_id = p.id
  WHERE c.account_id = p_account_id
    AND c.is_active = true
  ORDER BY c.created_at DESC
  LIMIT 100;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_coupons_with_partnerships(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coupons_with_partnerships(UUID) TO anon;

COMMENT ON FUNCTION public.get_coupons_with_partnerships IS 'שליפת קופונים פעילים עם פרטי המותגים - AI-First Strategy';
