-- ==================================================
-- Migration 152: Co-Pilot console (counts + config merge)
-- ==================================================
-- The partner console lists every association a partner owns with its
-- activity, and lets partner staff edit an association's assistant settings.
--
-- 1. partner_account_counts: one round trip for the list's counts (same
--    shape and reasoning as 091: selecting rows and counting in JS caps at
--    PostgREST's 1000-row default and under-reports silently).
-- 2. copilot_merge_config: settings writes merge into accounts.config->'copilot'
--    inside one UPDATE. Never read-modify-write the whole config: this repo has
--    lost whole account configs to that race (a scan finishing while an admin
--    saved). The merge is one level deep on purpose: a key in p_patch replaces
--    that key's value whole (e.g. `branding`), every other copilot key and every
--    key outside copilot are untouched.
--
-- 3. copilot_delete_secret: undo the Vault secret of a console create that failed.
--
-- 1 and 2: invoker rights, search_path pinned. All three: execute for service_role only.
-- ==================================================

create or replace function public.partner_account_counts(p_account_ids uuid[], p_since timestamptz)
returns table (account_id uuid, sessions bigint, messages bigint, escalations bigint, last_activity timestamptz)
language sql
stable
set search_path = public
as $$
  select
    a.id as account_id,
    (select count(*) from public.chat_sessions s
      where s.account_id = a.id and s.ref_source = 'copilot' and s.created_at >= p_since) as sessions,
    (select coalesce(sum(s.message_count), 0)::bigint from public.chat_sessions s
      where s.account_id = a.id and s.ref_source = 'copilot' and s.created_at >= p_since) as messages,
    (select count(*) from public.support_requests r
      where r.account_id = a.id and r.source = 'copilot_escalation' and r.created_at >= p_since) as escalations,
    -- All-time, not windowed: "last activity" answers "is anyone using it at all".
    (select max(s.last_turn_at) from public.chat_sessions s
      where s.account_id = a.id and s.ref_source = 'copilot') as last_activity
  from unnest(p_account_ids) as a(id);
$$;

comment on function public.partner_account_counts(uuid[], timestamptz) is
  'Co-Pilot console: per-association sessions/messages/escalations since p_since and all-time last activity. One round trip.';

create or replace function public.copilot_merge_config(p_account_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_copilot jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'copilot_merge_config: patch must be a jsonb object';
  end if;

  update public.accounts
     set config = jsonb_set(
           case when jsonb_typeof(config) = 'object' then config else '{}'::jsonb end,
           '{copilot}',
           (case when jsonb_typeof(config->'copilot') = 'object' then config->'copilot' else '{}'::jsonb end) || p_patch,
           true)
   where id = p_account_id
  returning config->'copilot' into v_copilot;

  -- Null when the account does not exist (the caller answers 404).
  return v_copilot;
end;
$$;

comment on function public.copilot_merge_config(uuid, jsonb) is
  'Co-Pilot console: merge p_patch one level deep into accounts.config->copilot in a single UPDATE; returns the new copilot object, or null for an unknown account.';

-- Rollback of a failed console create: remove the identify secret it stored. Same
-- SECURITY DEFINER pattern as 150's copilot_store_secret/copilot_read_secret, and like
-- the read it only touches Co-Pilot secrets (named copilot_*).
create or replace function public.copilot_delete_secret(p_ref uuid)
returns boolean language plpgsql security definer
set search_path = vault, extensions, public, pg_temp as $$
declare v_n int;
begin
  delete from vault.secrets s where s.id = p_ref and s.name like 'copilot\_%';
  get diagnostics v_n = row_count;
  return v_n > 0;
end; $$;

revoke all on function public.copilot_delete_secret(uuid) from public, anon, authenticated;
grant execute on function public.copilot_delete_secret(uuid) to service_role;

revoke execute on function public.partner_account_counts(uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.copilot_merge_config(uuid, jsonb)           from public, anon, authenticated;
grant  execute on function public.partner_account_counts(uuid[], timestamptz) to service_role;
grant  execute on function public.copilot_merge_config(uuid, jsonb)           to service_role;
