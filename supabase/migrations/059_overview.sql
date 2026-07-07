-- Migration 059: overview / month-close support on deals.
-- project_type: single_month | multi_month (null = auto-classify by line-item cadence).
-- commission_pct: per-deal sales-commission override (else the agency default).
-- moved_to_month: YYYY-MM when a deal is postponed to another month.

alter table public.partnerships
  add column if not exists project_type text,
  add column if not exists commission_pct numeric,
  add column if not exists moved_to_month text;
