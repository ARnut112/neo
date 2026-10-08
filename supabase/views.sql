-- Run this file in Supabase > SQL Editor > New query.
-- Intended for a new project; rerunning preserves the existing view count.
-- Only the Vercel server should call increment_page_views().
begin;

create table if not exists public.page_views (
  page_id text primary key check (page_id = 'home'),
  total_views bigint not null default 0 check (total_views >= 0),
  updated_at timestamptz not null default now()
);

alter table public.page_views enable row level security;

-- Browser keys must not read or change the counter directly.
-- No anonymous/authenticated RLS policies are needed for server-only access.
revoke all on table public.page_views from public, anon, authenticated;
grant select, insert, update on table public.page_views to service_role;

insert into public.page_views (page_id, total_views)
values ('home', 0)
on conflict (page_id) do nothing;

-- Increment in one atomic statement to avoid losing concurrent visits.
-- No caller-supplied count or page name is accepted.
create or replace function public.increment_page_views()
returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.page_views as counter (page_id, total_views, updated_at)
  values ('home', 1, now())
  on conflict (page_id) do update
    set total_views = counter.total_views + 1,
        updated_at = now()
  returning total_views;
$$;

-- Postgres grants PUBLIC function execution by default; remove it explicitly.
revoke all on function public.increment_page_views() from public, anon, authenticated;
grant execute on function public.increment_page_views() to service_role;

commit;

-- Inspect the count without incrementing:
-- select total_views from public.page_views where page_id = 'home';
-- Server integration: supabase.rpc('increment_page_views')
-- Do not put the service_role/secret key in HTML, script.js, or GitHub.
