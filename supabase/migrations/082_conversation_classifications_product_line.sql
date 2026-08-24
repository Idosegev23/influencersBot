-- ==================================================
-- Migration 082: product_line on conversation_classifications
-- ==================================================
-- Argania's customers name a SERIES, not a SKU: "סדרת קיק", "מי חומצה
-- היאלורונית וקרטין". Exact SKU matching therefore attributed only 2.6% of
-- complaints. The line is a real answer to "which range is generating the
-- complaints", and widget_products.product_line already carries it.
-- ==================================================

ALTER TABLE public.conversation_classifications
  ADD COLUMN IF NOT EXISTS product_line TEXT;

CREATE INDEX IF NOT EXISTS idx_conv_class_product_line
  ON public.conversation_classifications(account_id, product_line)
  WHERE product_line IS NOT NULL;

COMMENT ON COLUMN public.conversation_classifications.product_line IS
  'Product line (סדרה) resolved in code from the matched SKU, or from the raw mention against the account''s normalized line list. Customers name lines far more often than SKUs.';
