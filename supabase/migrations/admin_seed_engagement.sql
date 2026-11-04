alter table public.posts
  add column if not exists seed_likes_count integer not null default 0
    check (seed_likes_count >= 0),
  add column if not exists seed_comments_count integer not null default 0
    check (seed_comments_count >= 0);

create or replace view public.post_like_counts
with (security_invoker = true) as
  select
    p.id as post_id,
    greatest(count(l.id)::bigint, p.seed_likes_count::bigint) as likes_count
  from public.posts p
  left join public.likes l on l.post_id = p.id
  group by p.id, p.seed_likes_count;

grant select on public.post_like_counts to anon, authenticated;

create or replace function public.admin_seed_engagement(
  p_post_id uuid,
  p_likes_count integer default null,
  p_comments_count integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized: Only global admins can seed engagement.';
  end if;

  if p_likes_count is null and p_comments_count is null then
    raise exception 'Provide at least one engagement count to update.';
  end if;
  if p_likes_count is not null and p_likes_count < 0 then
    raise exception 'Engagement counts cannot be negative.';
  end if;
  if p_comments_count is not null and p_comments_count < 0 then
    raise exception 'Engagement counts cannot be negative.';
  end if;

  update public.posts
  set
    seed_likes_count = coalesce(p_likes_count, seed_likes_count),
    seed_comments_count = coalesce(p_comments_count, seed_comments_count)
  where id = p_post_id;

  if not found then
    raise exception 'Post not found.';
  end if;
end;
$$;

revoke all on function public.admin_seed_engagement(uuid, integer, integer) from public, anon;
grant execute on function public.admin_seed_engagement(uuid, integer, integer) to authenticated;
