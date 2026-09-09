-- 091 — one grouped query for the admin "websites" capability badges.
--
-- GET /api/admin/websites used to run three `count: 'exact'` queries inside a
-- sequential `for..of await` over every account with a registered widget
-- domain. The inner Promise.all only parallelised the three counts *within* one
-- account, so the accounts themselves ran strictly one after another: 44
-- accounts = 132 queries in 44 serial round trips.
--
-- Measured on the real code path (scripts/_probe-admin-websites.mjs):
--   sequential loop ....... 22,995 ms   (44 round trips)
--   this function ......... 69–336 ms   (1 round trip)
-- The DB was never the bottleneck — each individual count is ~2 ms. The cost
-- was 44 serial HTTP round trips to PostgREST.
--
-- This hurt more than the /admin/websites page: /admin/dashboard (which is also
-- /admin, the panel's entry screen) fetches the same route just to show two
-- numbers, and gates its whole render on the slowest of its four fetches.
--
-- Takes the account ids explicitly rather than re-deriving "has a widget
-- domain" in SQL, so this function and the route can never drift apart on what
-- counts as a website.
--
-- NOTE for anyone tempted to do this in the client instead: selecting the rows
-- and taking `data.length` silently caps at PostgREST's 1000-row default.
-- document_chunks holds 124,657 rows live, so that approach under-reports
-- without erroring.
create or replace function public.admin_widget_content_counts(p_account_ids uuid[])
returns table (account_id uuid, pages bigint, chunks bigint, products bigint)
language sql
stable
set search_path = public
as $$
  select
    a.id as account_id,
    (select count(*) from documents d       where d.account_id = a.id) as pages,
    (select count(*) from document_chunks c where c.account_id = a.id) as chunks,
    (select count(*) from widget_products w where w.account_id = a.id
                                              and w.is_available)      as products
  from unnest(p_account_ids) as a(id);
$$;

comment on function public.admin_widget_content_counts(uuid[]) is
  'Per-account documents/chunks/available-products counts for the admin websites view. One round trip; replaces a 44-iteration sequential count loop.';

-- Invoker rights (no `security definer`), search_path pinned, execute revoked
-- from public/anon/authenticated. The only caller is the service-role client in
-- /api/admin/websites, behind requireAdminAuth.
revoke execute on function public.admin_widget_content_counts(uuid[]) from public, anon, authenticated;
grant  execute on function public.admin_widget_content_counts(uuid[]) to service_role;
