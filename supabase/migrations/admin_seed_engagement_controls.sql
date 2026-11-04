alter table public.posts
  add column if not exists seed_views_count integer not null default 0
    check (seed_views_count >= 0);

alter table public.confessions
  add column if not exists seed_likes_count integer not null default 0
    check (seed_likes_count >= 0),
  add column if not exists seed_comments_count integer not null default 0
    check (seed_comments_count >= 0),
  add column if not exists seed_views_count integer not null default 0
    check (seed_views_count >= 0);

alter table public.admin_seed_profiles
  add column if not exists seed_followers_count integer not null default 0
    check (seed_followers_count >= 0);

drop function if exists public.admin_list_seed_profiles();
create function public.admin_list_seed_profiles()
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  school_id uuid,
  created_at timestamptz,
  seed_followers_count integer
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
    select s.id, s.username, s.full_name, s.avatar_url, s.school_id, s.created_at,
      s.seed_followers_count
    from public.admin_seed_profiles s
    order by s.created_at desc;
end;
$$;
revoke all on function public.admin_list_seed_profiles() from public, anon;
grant execute on function public.admin_list_seed_profiles() to authenticated;

create or replace function public.admin_list_seed_engagement()
returns table (
  item_kind text,
  item_id uuid,
  seed_profile_id uuid,
  username text,
  content text,
  created_at timestamptz,
  seed_likes_count integer,
  seed_comments_count integer,
  seed_views_count integer
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
    select 'post'::text, p.id, p.seed_profile_id, s.username, p.content, p.created_at,
      p.seed_likes_count, p.seed_comments_count, p.seed_views_count
    from public.posts p
    join public.admin_seed_profiles s on s.id = p.seed_profile_id
    union all
    select 'confession'::text, c.id, c.seed_profile_id, s.username, c.content, c.created_at,
      c.seed_likes_count, c.seed_comments_count, c.seed_views_count
    from public.confessions c
    join public.admin_seed_profiles s on s.id = c.seed_profile_id
    order by 6 desc;
end;
$$;

create or replace function public.admin_add_seed_likes(p_post_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed engagement increment must be between 1 and 100000.';
  end if;
  update public.posts
  set seed_likes_count = seed_likes_count + p_count
  where id = p_post_id and seed_profile_id is not null
  returning seed_likes_count into updated_count;
  if not found then raise exception 'Seed post not found.'; end if;
  return updated_count;
end;
$$;

create or replace function public.admin_add_seed_comments(p_post_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed engagement increment must be between 1 and 100000.';
  end if;
  update public.posts
  set seed_comments_count = seed_comments_count + p_count
  where id = p_post_id and seed_profile_id is not null
  returning seed_comments_count into updated_count;
  if not found then raise exception 'Seed post not found.'; end if;
  return updated_count;
end;
$$;

create or replace function public.admin_increment_views(p_post_id uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed view increment must be between 1 and 100000.';
  end if;
  update public.posts
  set seed_views_count = seed_views_count + p_count
  where id = p_post_id and seed_profile_id is not null
  returning seed_views_count into updated_count;
  if not found then raise exception 'Seed post not found.'; end if;
  return updated_count;
end;
$$;

create or replace function public.admin_add_seed_confession_likes(p_confession_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed engagement increment must be between 1 and 100000.';
  end if;
  update public.confessions
  set seed_likes_count = seed_likes_count + p_count
  where id = p_confession_id and seed_profile_id is not null
  returning seed_likes_count into updated_count;
  if not found then raise exception 'Seed confession not found.'; end if;
  return updated_count;
end;
$$;

create or replace function public.admin_add_seed_confession_comments(p_confession_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed engagement increment must be between 1 and 100000.';
  end if;
  update public.confessions
  set seed_comments_count = seed_comments_count + p_count
  where id = p_confession_id and seed_profile_id is not null
  returning seed_comments_count into updated_count;
  if not found then raise exception 'Seed confession not found.'; end if;
  return updated_count;
end;
$$;

create or replace function public.admin_increment_confession_views(p_confession_id uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed view increment must be between 1 and 100000.';
  end if;
  update public.confessions
  set seed_views_count = seed_views_count + p_count
  where id = p_confession_id and seed_profile_id is not null
  returning seed_views_count into updated_count;
  if not found then raise exception 'Seed confession not found.'; end if;
  return updated_count;
end;
$$;

create or replace function public.admin_add_seed_followers(p_seed_profile_id uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer;
begin
  if not public.is_global_admin() then raise exception 'Unauthorized'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then
    raise exception 'Seed follower increment must be between 1 and 100000.';
  end if;
  update public.admin_seed_profiles
  set seed_followers_count = seed_followers_count + p_count
  where id = p_seed_profile_id
  returning seed_followers_count into updated_count;
  if not found then raise exception 'Seed profile not found.'; end if;
  return updated_count;
end;
$$;

revoke all on function public.admin_list_seed_engagement() from public, anon;
revoke all on function public.admin_add_seed_likes(uuid, integer) from public, anon;
revoke all on function public.admin_add_seed_comments(uuid, integer) from public, anon;
revoke all on function public.admin_increment_views(uuid, integer) from public, anon;
revoke all on function public.admin_add_seed_confession_likes(uuid, integer) from public, anon;
revoke all on function public.admin_add_seed_confession_comments(uuid, integer) from public, anon;
revoke all on function public.admin_increment_confession_views(uuid, integer) from public, anon;
revoke all on function public.admin_add_seed_followers(uuid, integer) from public, anon;
grant execute on function public.admin_list_seed_engagement() to authenticated;
grant execute on function public.admin_add_seed_likes(uuid, integer) to authenticated;
grant execute on function public.admin_add_seed_comments(uuid, integer) to authenticated;
grant execute on function public.admin_increment_views(uuid, integer) to authenticated;
grant execute on function public.admin_add_seed_confession_likes(uuid, integer) to authenticated;
grant execute on function public.admin_add_seed_confession_comments(uuid, integer) to authenticated;
grant execute on function public.admin_increment_confession_views(uuid, integer) to authenticated;
grant execute on function public.admin_add_seed_followers(uuid, integer) to authenticated;
