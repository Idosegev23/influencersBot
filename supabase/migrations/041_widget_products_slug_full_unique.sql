-- Replace partial unique index with a full one so ON CONFLICT (account_id, slug)
-- works in upserts. Postgres treats NULLs as distinct in unique indexes, so
-- legacy rows without a slug won't conflict with each other.
DROP INDEX IF EXISTS widget_products_account_slug_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS widget_products_account_slug_uniq
  ON widget_products (account_id, slug);
