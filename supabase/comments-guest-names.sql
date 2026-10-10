-- Run after comments-guest.sql, before deploying custom guest names.
-- Keeps all existing reviews, including unnamed guests. Safe to run again.
begin;
alter table public.comments drop constraint if exists comments_author_kind;
alter table public.comments add constraint comments_author_kind check (
  (user_id is not null and guest_key is null)
  or (user_id is null and guest_key is not null and guest_key ~ '^[0-9a-f]{64}$'
      and char_length(display_name) between 1 and 40 and avatar_url is null)
);
notify pgrst, 'reload schema';
commit;
