alter table public.profiles
  add column if not exists full_name text,
  add column if not exists class_form text,
  add column if not exists cover_url text;
