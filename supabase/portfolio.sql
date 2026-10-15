-- Run in Supabase SQL Editor as postgres. Existing comments/views are untouched.
begin;
create table if not exists public.portfolio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.portfolio_admins enable row level security;
revoke all on public.portfolio_admins from public, anon, authenticated, service_role;
grant select on public.portfolio_admins to service_role;

create table if not exists public.portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('production', 'preview')),
  category text not null check (category in ('wedding', 'ordination', 'graduation', 'other')),
  local_path text,
  storage_path text unique,
  alt text not null check (char_length(alt) between 1 and 160),
  width integer not null check (width between 1 and 8000),
  height integer not null check (height between 1 and 8000),
  sort_order integer not null default 1000 check (sort_order between 0 and 100000),
  published boolean not null default false,
  ready boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel, category, local_path),
  check (ready or not published),
  check (
    (local_path is not null and storage_path is null and local_path ~ '^img/[A-Za-z0-9_./ -]+\.(jpg|jpeg|png|webp)$' and position('..' in local_path) = 0)
    or (local_path is null and storage_path is not null and storage_path ~ '^(production|preview)/(wedding|ordination|graduation|other)/[0-9a-f-]{36}\.jpg$' and split_part(storage_path, '/', 1) = channel)
  )
);
create index if not exists portfolio_photos_listing on public.portfolio_photos(channel, category, sort_order, created_at);
alter table public.portfolio_photos enable row level security;
revoke all on public.portfolio_photos from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.portfolio_photos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-images', 'portfolio-images', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Public image URLs are readable; all writes go through the protected admin API.
drop policy if exists portfolio_images_server_only on storage.objects;
create policy portfolio_images_server_only on storage.objects as restrictive for all
to anon, authenticated using (bucket_id <> 'portfolio-images') with check (bucket_id <> 'portfolio-images');

-- This email must already exist in Authentication > Users (Google sign-in).
insert into public.portfolio_admins (user_id)
select id from auth.users where lower(email) = 'arnut369@gmail.com' and email_confirmed_at is not null
on conflict (user_id) do nothing;

-- Seed original local photos only when a channel has no photo records yet.
insert into public.portfolio_photos (channel, category, local_path, alt, width, height, sort_order, published, ready)
select ch.channel, originals.category, originals.local_path, originals.alt, originals.width, originals.height, originals.sort_order, true, true
from (values
  ('wedding', 'img/nun.jpg', 'งานแต่ง''', 3625, 3625, 10),
  ('wedding', 'img/mawork/w2.jpg', 'งานแต่ง', 1920, 1920, 20),
  ('wedding', 'img/mawork/w4.jpg', 'งานแต่ง', 1920, 1920, 30),
  ('wedding', 'img/mawork/w3.jpg', 'งานแต่ง', 1920, 1920, 40),
  ('wedding', 'img/OPL_3476.jpg', 'งานแต่ง', 1898, 2531, 50),
  ('ordination', 'img/mawork/b12.jpg', 'งานบวช', 1920, 1920, 10),
  ('ordination', 'img/mawork/b11.jpg', 'งานบวช', 1920, 1920, 20),
  ('ordination', 'img/mawork/b10.jpg', 'งานบวช', 1920, 1920, 30),
  ('ordination', 'img/mawork/b9.jpg', 'งานบวช', 1920, 1920, 40),
  ('ordination', 'img/mawork/b8.jpg', 'งานบวช', 1920, 1920, 50),
  ('ordination', 'img/mawork/b7.jpg', 'งานบวช', 1920, 1920, 60),
  ('ordination', 'img/mawork/b2.jpg', 'งานบวช', 1920, 1920, 70),
  ('ordination', 'img/mawork/b3.jpg', 'งานบวช', 1920, 1920, 80),
  ('ordination', 'img/mawork/b4.jpg', 'งานบวช', 1920, 1920, 90),
  ('ordination', 'img/mawork/b5.jpg', 'งานบวช', 1920, 1920, 100),
  ('ordination', 'img/mawork/b6.jpg', 'งานบวช', 1920, 1920, 110),
  ('ordination', 'img/mawork/b1.jpg', 'งานบวช', 1920, 1920, 120),
  ('ordination', 'img/mawork/b13.jpg', 'งานบวช', 1920, 1920, 130),
  ('ordination', 'img/mawork/b14.jpg', 'งานบวช', 1920, 1920, 140),
  ('graduation', 'img/mawork/c1.jpg', 'งานรับปริญญา', 1920, 1920, 10),
  ('graduation', 'img/mawork/c2.jpg', 'งานรับปริญญา', 1920, 1920, 20),
  ('graduation', 'img/mawork/c3.jpg', 'งานรับปริญญา', 1920, 1920, 30),
  ('graduation', 'img/mawork/c4.jpg', 'งานรับปริญญา', 1920, 1920, 40),
  ('graduation', 'img/mawork/c5.jpg', 'งานรับปริญญา', 1920, 1920, 50),
  ('graduation', 'img/mawork/c6.jpg', 'งานรับปริญญา', 1920, 1920, 60),
  ('other', 'img/mawork/a4.jpg', 'ผลงานอื่นๆ', 1920, 1920, 10),
  ('other', 'img/mawork/a1.jpg', 'ผลงานอื่นๆ', 1920, 1920, 20),
  ('other', 'img/wang.jpg', 'ผลงานอื่นๆ', 1080, 1350, 30),
  ('other', 'img/mama.jpg', 'ผลงานอื่นๆ', 1080, 1080, 40),
  ('other', 'img/mawork/a3.jpg', 'ผลงานอื่นๆ', 1920, 1920, 50),
  ('other', 'img/mawork/a2.jpg', 'ผลงานอื่นๆ', 1920, 1920, 60),
  ('other', 'img/ava.jpg', 'ผลงานอื่นๆ', 1080, 1080, 70)) as originals(category, local_path, alt, width, height, sort_order)
cross join (values ('production'), ('preview')) as ch(channel)
where not exists (select 1 from public.portfolio_photos existing where existing.channel = ch.channel)
on conflict (channel, category, local_path) do nothing;

notify pgrst, 'reload schema';
commit;

select exists (select 1 from public.portfolio_admins a join auth.users u on u.id = a.user_id
  where lower(u.email) = 'arnut369@gmail.com') as admin_ready;
