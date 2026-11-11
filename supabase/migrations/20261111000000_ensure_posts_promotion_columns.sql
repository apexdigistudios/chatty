alter table public.posts
  add column if not exists is_promoted boolean not null default false,
  add column if not exists promoted_until timestamptz,
  add column if not exists promotion_status text;

notify pgrst, 'reload schema';
