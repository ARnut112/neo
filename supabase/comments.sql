-- Run in the Supabase SQL Editor. No public client can approve comments.
begin;
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('production', 'preview')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  message text not null check (char_length(message) between 5 and 400),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  submitted_on date not null default ((now() at time zone 'UTC')::date),
  -- Atomic daily limit, including simultaneous requests and double clicks.
  unique (user_id, channel, submitted_on)
);
create index if not exists comments_public_list
  on public.comments (channel, status, created_at desc);
alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
revoke all on public.comments from service_role;
grant select, insert on public.comments to service_role;
commit;

-- Approve in Dashboard > Table Editor > comments:
-- inspect message/name, then change status from pending to approved and Save.
-- Use rejected to hide it. Filter channel to separate preview from production.
-- Do not grant public UPDATE or create an anonymous approval policy.
