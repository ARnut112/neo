-- Run after the existing comments/guest migrations. No comments are deleted.
begin;
-- The protected admin API can change only status; public reviewers have no UPDATE permission.
grant update (status) on public.comments to service_role;
notify pgrst, 'reload schema';
commit;

select has_column_privilege('service_role', 'public.comments', 'status', 'UPDATE') as moderation_ready;
