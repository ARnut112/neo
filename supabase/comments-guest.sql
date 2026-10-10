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
          and display_name = 'ผู้ชมไม่ระบุตัวตน' and avatar_url is null)
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
commit;
