create table if not exists public.admin_seed_profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  full_name text not null,
  avatar_url text,
  school_id uuid not null references public.schools(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_seed_profiles_username_check
    check (username ~ '^[A-Za-z0-9_]{3,24}$')
);

create unique index if not exists admin_seed_profiles_username_lower_idx
  on public.admin_seed_profiles (lower(username));

alter table public.admin_seed_profiles enable row level security;
drop policy if exists "Seed profiles are public" on public.admin_seed_profiles;
create policy "Seed profiles are public" on public.admin_seed_profiles
  for select using (true);
grant select on public.admin_seed_profiles to anon, authenticated;
revoke insert, update, delete on public.admin_seed_profiles from anon, authenticated;

alter table public.posts
  add column if not exists seed_profile_id uuid
  references public.admin_seed_profiles(id) on delete cascade;
create index if not exists posts_seed_profile_id_idx
  on public.posts (seed_profile_id, created_at desc)
  where seed_profile_id is not null;

alter table public.confessions
  add column if not exists seed_profile_id uuid
  references public.admin_seed_profiles(id) on delete cascade,
  add column if not exists is_anonymous boolean not null default true;

create table if not exists public.confession_media (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.confession_media enable row level security;
drop policy if exists "Confession media is visible with its confession" on public.confession_media;
create policy "Confession media is visible with its confession" on public.confession_media
  for select using (
    exists (
      select 1 from public.confessions c
      where c.id = confession_media.confession_id
        and (c.moderation_status = 'approved' or c.author_id = auth.uid() or public.is_global_admin())
    )
  );
grant select on public.confession_media to anon, authenticated;
revoke insert, update, delete on public.confession_media from anon, authenticated;

drop policy if exists "letsgist-media: global admin delete seed media" on storage.objects;
create policy "letsgist-media: global admin delete seed media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'letsgist-media'
    and (storage.foldername(name))[2] = 'seed-posts'
    and public.is_global_admin()
  );

create or replace view public.public_confessions as
  select
    c.id,
    c.school_id,
    c.category,
    c.content,
    c.created_at,
    c.published_at,
    case when not c.is_anonymous then s.username else null end as seed_username,
    case when not c.is_anonymous then s.full_name else null end as seed_full_name,
    case when not c.is_anonymous then s.avatar_url else null end as seed_avatar_url,
    (not c.is_anonymous and s.id is not null) as is_seed,
    coalesce((
      select array_agg(cm.media_url order by cm.sort_order)
      from public.confession_media cm where cm.confession_id = c.id
    ), array[]::text[]) as media_urls,
    coalesce((
      select array_agg(cm.media_type order by cm.sort_order)
      from public.confession_media cm where cm.confession_id = c.id
    ), array[]::text[]) as media_types
  from public.confessions c
  left join public.admin_seed_profiles s on s.id = c.seed_profile_id
  where c.moderation_status = 'approved';
grant select on public.public_confessions to anon, authenticated;

create or replace function public.admin_list_seed_profiles()
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  school_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
    select s.id, s.username, s.full_name, s.avatar_url, s.school_id, s.created_at
    from public.admin_seed_profiles s
    order by s.created_at desc;
end;
$$;

create or replace function public.admin_create_seed_profiles(p_profiles jsonb)
returns setof public.admin_seed_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_count integer;
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;
  if p_profiles is null or jsonb_typeof(p_profiles) <> 'array' then
    raise exception 'Profiles must be a JSON array';
  end if;

  profile_count := jsonb_array_length(p_profiles);
  if profile_count < 1 or profile_count > 50 then
    raise exception 'Create between 1 and 50 profiles at a time';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_profiles) as item(
      username text, full_name text, avatar_url text, school_id uuid
    )
    where item.username is null
      or item.username !~ '^[A-Za-z0-9_]{3,24}$'
      or item.full_name is null
      or char_length(trim(item.full_name)) not between 1 and 80
      or item.school_id is null
  ) then
    raise exception 'Each profile needs a valid username, name, and school';
  end if;

  return query
    insert into public.admin_seed_profiles (username, full_name, avatar_url, school_id)
    select trim(item.username), trim(item.full_name), nullif(trim(item.avatar_url), ''), item.school_id
    from jsonb_to_recordset(p_profiles) as item(
      username text, full_name text, avatar_url text, school_id uuid
    )
    returning *;
end;
$$;

create or replace function public.admin_update_seed_profile(
  p_seed_profile_id uuid,
  p_username text,
  p_full_name text,
  p_avatar_url text,
  p_school_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;
  if p_username !~ '^[A-Za-z0-9_]{3,24}$'
    or char_length(trim(p_full_name)) not between 1 and 80
    or p_school_id is null then
    raise exception 'Profile details are invalid';
  end if;

  update public.admin_seed_profiles
  set username = trim(p_username),
      full_name = trim(p_full_name),
      avatar_url = nullif(trim(p_avatar_url), ''),
      school_id = p_school_id
  where id = p_seed_profile_id;

  if not found then
    raise exception 'Seed profile not found';
  end if;
end;
$$;

create or replace function public.admin_delete_seed_profile(p_seed_profile_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  media_urls text[];
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;
  select coalesce(array_agg(distinct media.url), array[]::text[])
  into media_urls
  from (
    select pm.media_url as url
    from public.posts p
    join public.post_media pm on pm.post_id = p.id
    where p.seed_profile_id = p_seed_profile_id
    union
    select cm.media_url as url
    from public.confessions c
    join public.confession_media cm on cm.confession_id = c.id
    where c.seed_profile_id = p_seed_profile_id
  ) media;

  delete from public.admin_seed_profiles where id = p_seed_profile_id;
  if not found then
    raise exception 'Seed profile not found';
  end if;
  return media_urls;
end;
$$;

create or replace function public.admin_create_post_as_seed(
  p_seed_profile_id uuid,
  p_school_id uuid,
  p_content text,
  p_media jsonb default '[]'::jsonb,
  p_is_confession boolean default false,
  p_is_anonymous boolean default true,
  p_category text default 'School Secret'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := auth.uid();
  seed_profile public.admin_seed_profiles%rowtype;
  media_count integer;
  image_count integer;
  video_count integer;
  created_post_id uuid;
  created_confession_id uuid;
  first_media_url text;
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;
  if admin_id is null then
    raise exception 'Sign in required';
  end if;

  select * into seed_profile
  from public.admin_seed_profiles
  where id = p_seed_profile_id;
  if not found then
    raise exception 'Seed profile not found';
  end if;
  if p_school_id is null or not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'Choose a valid school';
  end if;
  if p_content is null or char_length(trim(p_content)) > 300 then
    raise exception 'Content must be 300 characters or fewer';
  end if;
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then
    raise exception 'Media must be a JSON array';
  end if;

  media_count := jsonb_array_length(coalesce(p_media, '[]'::jsonb));
  select count(*) filter (where item.media_type = 'image'),
         count(*) filter (where item.media_type = 'video')
    into image_count, video_count
  from jsonb_to_recordset(coalesce(p_media, '[]'::jsonb)) as item(url text, media_type text);
  if image_count > 5 or video_count > 3 or image_count + video_count <> media_count then
    raise exception 'Use no more than 5 images and 3 videos';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_media, '[]'::jsonb)) as item(url text, media_type text)
    where item.url is null
      or item.media_type not in ('image', 'video')
      or position('/storage/v1/object/public/letsgist-media/' || admin_id::text || '/seed-posts/' in item.url) = 0
  ) then
    raise exception 'Media must be uploaded through the seed-post uploader';
  end if;

  if p_is_confession then
    if char_length(trim(p_content)) not between 1 and 300 then
      raise exception 'Confessions need text between 1 and 300 characters';
    end if;
    if p_category not in ('Crush Confession', 'School Secret', 'Relationship Gist', 'Friendship Gist') then
      raise exception 'Choose a valid confession category';
    end if;

    insert into public.confessions (
      author_id, seed_profile_id, is_anonymous, school_id, category, content,
      moderation_status, published_at
    ) values (
      null, seed_profile.id, coalesce(p_is_anonymous, true), p_school_id, p_category,
      trim(p_content), 'approved', now()
    )
    returning id into created_confession_id;
    insert into public.confession_media (confession_id, media_url, media_type, sort_order)
    select created_confession_id, item.url, item.media_type, item.sort_order
    from jsonb_to_recordset(coalesce(p_media, '[]'::jsonb))
      as item(url text, media_type text, sort_order integer);
    return created_confession_id;
  end if;

  if char_length(trim(p_content)) = 0 and media_count = 0 then
    raise exception 'Add text or an attachment';
  end if;

  first_media_url := p_media -> 0 ->> 'url';
  insert into public.posts (user_id, seed_profile_id, school_id, content, media_url, post_type, status)
  values (
    admin_id,
    seed_profile.id,
    p_school_id,
    trim(p_content),
    first_media_url,
    'public',
    'active'
  )
  returning id into created_post_id;

  insert into public.post_media (post_id, media_url, media_type, sort_order)
  select created_post_id, item.url, item.media_type, item.sort_order
  from jsonb_to_recordset(coalesce(p_media, '[]'::jsonb))
    as item(url text, media_type text, sort_order integer);

  return created_post_id;
end;
$$;

create or replace function public.admin_clear_all_seed_data()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  media_urls text[];
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;

  select coalesce(array_agg(distinct media.url), array[]::text[])
  into media_urls
  from (
    select pm.media_url as url
    from public.posts p
    join public.post_media pm on pm.post_id = p.id
    where p.seed_profile_id is not null
    union
    select cm.media_url as url
    from public.confessions c
    join public.confession_media cm on cm.confession_id = c.id
    where c.seed_profile_id is not null
  ) media;

  delete from public.confessions where seed_profile_id is not null;
  delete from public.posts where seed_profile_id is not null;
  delete from public.admin_seed_profiles;
  return media_urls;
end;
$$;

revoke all on function public.admin_list_seed_profiles() from public;
revoke all on function public.admin_create_seed_profiles(jsonb) from public;
revoke all on function public.admin_update_seed_profile(uuid, text, text, text, uuid) from public;
revoke all on function public.admin_delete_seed_profile(uuid) from public;
revoke all on function public.admin_create_post_as_seed(uuid, uuid, text, jsonb, boolean, boolean, text) from public;
revoke all on function public.admin_clear_all_seed_data() from public;
grant execute on function public.admin_list_seed_profiles() to authenticated;
grant execute on function public.admin_create_seed_profiles(jsonb) to authenticated;
grant execute on function public.admin_update_seed_profile(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.admin_delete_seed_profile(uuid) to authenticated;
grant execute on function public.admin_create_post_as_seed(uuid, uuid, text, jsonb, boolean, boolean, text) to authenticated;
grant execute on function public.admin_clear_all_seed_data() to authenticated;
