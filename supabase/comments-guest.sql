-- Existing projects: run this in Supabase SQL Editor BEFORE deploying guest reviews.
-- New projects: run comments.sql first, then this file. Existing reviews are preserved.
begin;
alter table public.comments alter column user_id drop not null;
alter table public.comments add column if not exists guest_key text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_author_kind') then
    alter table public.comments add constraint comments_author_kind check (
      (user_id is not null and guest_key is null)
      or (user_id is null and guest_key is not null and guest_key ~ '^[0-9a-f]{64}$'
          and char_length(display_name) between 1 and 40 and avatar_url is null)
    );
  end if;
end;
$$;
-- Database uniqueness enforces the guest limit even across concurrent serverless requests.
create unique index if not exists comments_guest_daily
  on public.comments (guest_key, channel, submitted_on) where guest_key is not null;
alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
revoke all on public.comments from service_role;
grant select, insert on public.comments to service_role;
-- Refresh the REST schema cache after adding guest_key.
notify pgrst, 'reload schema';
commit;

-- After Success: user_id_nullable must be YES and guest_key_exists must be true.
select
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'comments' and column_name = 'user_id') as user_id_nullable,
  exists (select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'comments' and column_name = 'guest_key') as guest_key_exists;
