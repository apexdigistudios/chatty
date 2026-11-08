alter table public.posts
  add column if not exists media_type text check (media_type in ('image', 'video')),
  add column if not exists video_duration_seconds integer;

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
  first_media_type text;
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
      or position('/' || admin_id::text || '/seed-posts/' in item.url) = 0
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
  first_media_type := p_media -> 0 ->> 'media_type';
  insert into public.posts (
    user_id, seed_profile_id, school_id, content, media_url, media_type, post_type, status
  )
  values (
    admin_id,
    seed_profile.id,
    p_school_id,
    trim(p_content),
    first_media_url,
    first_media_type,
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

revoke all on function public.admin_create_post_as_seed(uuid, uuid, text, jsonb, boolean, boolean, text) from public;
grant execute on function public.admin_create_post_as_seed(uuid, uuid, text, jsonb, boolean, boolean, text) to authenticated;
