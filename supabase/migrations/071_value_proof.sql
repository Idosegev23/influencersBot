-- 071_value_proof.sql — value-proof metrics
-- Spec: docs/superpowers/specs/2026-07-26-value-proof-metrics-design.md
-- Plan: docs/superpowers/plans/2026-07-26-value-proof-metrics.md

-- ---------------------------------------------------------------------------
-- Identity normalizers.
--
-- bestie_wa_id is the SQL mirror of toWaId() in src/lib/whatsapp-cloud/client.ts:
-- strip non-digits -> drop a leading 00 -> a leading 0 becomes 972 -> a bare
-- 9-digit number gets 972. Kept IMMUTABLE so it can be used in indexes and joins.
-- Any change here must change toWaId too; tests/unit/value-proof-identity.test.ts
-- is the canonical fixture set.
-- ---------------------------------------------------------------------------
create or replace function bestie_wa_id(p text) returns text
language sql immutable as $$
  with d0 as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d),
       d1 as (select case when d like '00%' then substr(d, 3) else d end as d from d0),
       d2 as (select case when d like '0%'  then '972' || substr(d, 2) else d end as d from d1),
       d3 as (select case when length(d) = 9 then '972' || d else d end as d from d2)
  select nullif(d, '') from d3;
$$;

create or replace function bestie_email(p text) returns text
language sql immutable as $$
  select case when position('@' in lower(btrim(coalesce(p, '')))) > 1
              then lower(btrim(p)) else null end;
$$;
