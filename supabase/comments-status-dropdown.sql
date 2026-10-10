-- Run once in Supabase > SQL Editor, then refresh the Table Editor.
-- Preserves all existing comments and status values. Safe to run again.
begin;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'comment_status'
  ) then
    create type public.comment_status as enum ('pending', 'approved', 'rejected');
  end if;
end;
$$;

-- Drop the text default/check before converting to enum.
alter table public.comments alter column status drop default;
alter table public.comments drop constraint if exists comments_status_check;
alter table public.comments alter column status type public.comment_status
  using status::text::public.comment_status;
alter table public.comments alter column status set default 'pending'::public.comment_status;

notify pgrst, 'reload schema';
commit;

select column_name, udt_name as column_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'comments' and column_name = 'status';
