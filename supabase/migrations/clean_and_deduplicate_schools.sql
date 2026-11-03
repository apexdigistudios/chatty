begin;

alter table public.schools
  add column if not exists logo_url text;

alter table public.profiles
  add column if not exists school_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute column_row
      on column_row.attrelid = constraint_row.conrelid
     and column_row.attnum = any(constraint_row.conkey)
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.confrelid = 'public.schools'::regclass
      and constraint_row.contype = 'f'
      and column_row.attname = 'school_id'
  ) then
    alter table public.profiles
      add constraint profiles_school_id_fkey
      foreign key (school_id) references public.schools(id) on delete set null;
  end if;
end
$$;

update public.schools
set crest_url = null,
    logo_url = null;

do $$
declare
  duplicates text;
begin
  select string_agg(names, '; ')
  into duplicates
  from (
    select string_agg(name, ' / ' order by name) as names
    from public.schools
    group by lower(btrim(name))
    having count(*) > 1
  ) duplicate_groups;

  if duplicates is not null then
    raise exception 'Cannot add normalized school-name uniqueness until existing communities are manually merged: %', duplicates;
  end if;
end
$$;

create unique index if not exists idx_schools_unique_normalized_name
  on public.schools (lower(btrim(name)));

drop policy if exists "schools: public read" on public.schools;
create policy "schools: public read" on public.schools
  for select to anon, authenticated
  using (true);

drop policy if exists "schools: founders create" on public.schools;
create policy "schools: founders create" on public.schools
  for insert to authenticated
  with check (creator_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-assets', 'school-assets', true, 8388608, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school assets: public read" on storage.objects;
create policy "school assets: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'school-assets');

drop policy if exists "school assets: moderators upload" on storage.objects;
create policy "school assets: moderators upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-assets'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_school_moderator(((storage.foldername(name))[1])::uuid) or public.is_global_admin()
      else false
    end
  );

drop policy if exists "school assets: moderators update" on storage.objects;
create policy "school assets: moderators update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'school-assets'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_school_moderator(((storage.foldername(name))[1])::uuid) or public.is_global_admin()
      else false
    end
  )
  with check (
    bucket_id = 'school-assets'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_school_moderator(((storage.foldername(name))[1])::uuid) or public.is_global_admin()
      else false
    end
  );

drop policy if exists "school assets: moderators delete" on storage.objects;
create policy "school assets: moderators delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-assets'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_school_moderator(((storage.foldername(name))[1])::uuid) or public.is_global_admin()
      else false
    end
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  requested_school uuid;
  pending_school_name text;
  pending_school_region text;
  pending_school_type text;
  attempt int := 0;
begin
  base_username := lower(regexp_replace(
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, ''), '@', 1), 'student'),
    '[^A-Za-z0-9_]', '', 'g'));
  if char_length(base_username) < 3 then
    base_username := 'student' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  base_username := left(base_username, 20);
  candidate := base_username;

  begin
    requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  exception when others then
    requested_school := null;
  end;
  if requested_school is not null
     and not exists (select 1 from public.schools where id = requested_school) then
    requested_school := null;
  end if;

  pending_school_name := nullif(btrim(new.raw_user_meta_data->>'school_name'), '');
  pending_school_region := coalesce(nullif(btrim(new.raw_user_meta_data->>'school_region'), ''), 'Not specified');
  pending_school_type := lower(coalesce(nullif(new.raw_user_meta_data->>'school_type', ''), 'public'));
  if pending_school_type not in ('public', 'private', 'mission', 'technical') then
    pending_school_type := 'public';
  end if;

  loop
    begin
      insert into public.profiles (id, username, school_id, avatar_url, bio)
      values (
        new.id, candidate, requested_school,
        'https://api.dicebear.com/9.x/notionists/svg?seed=' || candidate || '&backgroundColor=ede9fe',
        '');
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      candidate := left(base_username, 16) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      if attempt > 5 then raise; end if;
    end;
  end loop;

  if pending_school_name is not null then
    if char_length(pending_school_name) < 3 or char_length(pending_school_name) > 80 then
      raise exception 'School names must be between 3 and 80 characters.';
    end if;

    begin
      insert into public.schools (name, region, school_type, creator_id)
      values (pending_school_name, pending_school_region, pending_school_type, new.id)
      returning id into requested_school;
    exception when unique_violation then
      select id into requested_school
      from public.schools
      where lower(btrim(name)) = lower(btrim(pending_school_name))
      order by created_at, id
      limit 1;
    end;

    update public.profiles
    set school_id = requested_school
    where id = new.id;
  end if;

  return new;
end;
$$;

commit;
