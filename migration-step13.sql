-- Step 13: customizable student profile cover photos.
alter table public.profiles
  add column if not exists cover_url text;
