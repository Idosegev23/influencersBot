-- Migration 054: per-deliverable pricing for a deal.
--
-- The agent prices EACH deliverable separately (human-in-the-loop). A deal
-- (partnerships row) has N line items; the quote total is derived from them.

create table if not exists public.deal_line_items (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  account_id uuid references public.accounts(id),        -- the influencer this line is for (multi-talent deals)
  platform text,                                          -- instagram | tiktok | youtube | ...
  deliverable_type text,                                  -- story | reel | post | combo | ...
  qty integer not null default 1,
  unit_price numeric not null default 0,                  -- per unit, before VAT
  vat_rate numeric not null default 0.18,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists deal_line_items_partnership_idx
  on public.deal_line_items (partnership_id);
