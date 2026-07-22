-- Migration 068: brand_orders — one internal store fed by per-platform connectors (spec §10.2).
-- Read-only mirror: number→id resolution + phone-verify + lazy line_items on live pull.
create table if not exists public.brand_orders (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts(id),
  external_id         text,
  order_number        text not null,   -- NOT NULL: connectors always supply it; keeps (account_id, order_number) upsert idempotent (NULLs are distinct in a unique index)
  customer_phone      text,
  customer_email      text,
  customer_name       text,
  financial_status    text,
  fulfillment_status  text,
  status              text,
  tracking_number     text,
  tracking_url        text,
  total               text,
  currency            text,
  line_items          jsonb,
  placed_at           timestamptz,
  source_platform     text,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists idx_brand_orders_account_number
  on public.brand_orders(account_id, order_number);
create index if not exists idx_brand_orders_phone
  on public.brand_orders(account_id, customer_phone);
comment on table public.brand_orders is
  'Unified read-only order store (spec §10.2). Unique(account_id, order_number) is the upsert target. line_items nullable (lazy-filled on live connector.pull).';
