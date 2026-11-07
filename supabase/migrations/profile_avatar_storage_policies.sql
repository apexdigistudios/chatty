-- Ensure profile edits and per-user avatar uploads work on existing projects.
-- Avatar object names use {auth.uid()}/avatars/{unique-file-name}.

alter table public.profiles enable row level security;

drop policy if exists "profiles: public read" on public.profiles;
drop policy if exists "profiles: own insert" on public.profiles;
drop policy if exists "profiles: own update" on public.profiles;

create policy "profiles: public read" on public.profiles
  for select using (true);
create policy "profiles: own insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());
create policy "profiles: own update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_global_admin())
  with check (id = auth.uid() or public.is_global_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'letsgist-media',
  'letsgist-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "letsgist-media: public read" on storage.objects;
drop policy if exists "letsgist-media: upload own folder" on storage.objects;
drop policy if exists "letsgist-media: owner update" on storage.objects;
drop policy if exists "letsgist-media: owner delete" on storage.objects;

create policy "letsgist-media: public read" on storage.objects
  for select using (bucket_id = 'letsgist-media');
create policy "letsgist-media: upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'letsgist-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "letsgist-media: owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'letsgist-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'letsgist-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "letsgist-media: owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'letsgist-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
