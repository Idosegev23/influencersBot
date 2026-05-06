-- Adds the columns we need for Dekel's product catalog (TheDekel.co.il "מילון תכשירים").
-- Existing widget_products already has: ingredients[], key_ingredients[], image_url, ai_profile,
-- product_url, embedding, etc. We add: slug (stable upsert key), brand, claims[], usage.

ALTER TABLE widget_products
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS claims TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS usage TEXT;

-- One product per (account, slug) — gives us a clean upsert key.
CREATE UNIQUE INDEX IF NOT EXISTS widget_products_account_slug_uniq
  ON widget_products (account_id, slug)
  WHERE slug IS NOT NULL;

-- Fast filter for claim-based chat queries (e.g. WHERE 'מאושר בהיריון' = ANY(claims))
CREATE INDEX IF NOT EXISTS widget_products_claims_gin
  ON widget_products USING GIN (claims);

-- Fast brand filter for "show me everything from X brand"
CREATE INDEX IF NOT EXISTS widget_products_brand_idx
  ON widget_products (account_id, brand);

COMMENT ON COLUMN widget_products.slug IS 'Source-system slug, e.g. iconix-lunar-bliss. Stable identifier for upsert/refresh.';
COMMENT ON COLUMN widget_products.brand IS 'Brand display name, e.g. "אייקוניקס | ICONIX".';
COMMENT ON COLUMN widget_products.claims IS 'Hebrew claim tags from the product page: pregnancy-safe, paraben-free, fragrance-free, etc.';
COMMENT ON COLUMN widget_products.usage IS 'Usage instructions ("אופן השימוש").';
