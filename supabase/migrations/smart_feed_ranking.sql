-- Apply after the posts, likes, comments, and safety_reporting migrations.
create or replace function public.get_smart_global_feed(
  p_excluded_post_ids uuid[] default array[]::uuid[],
  p_excluded_user_ids uuid[] default array[]::uuid[],
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (post_id uuid, engagement_score double precision)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with eligible_posts as (
    select
      post.id,
      post.created_at,
      (
        select count(*)::double precision
        from public.likes as post_like
        where post_like.post_id = post.id
      ) as likes_count,
      (
        select count(*)::double precision
        from public.comments as post_comment
        where post_comment.post_id = post.id
      ) as comments_count
    from public.posts as post
    where post.post_type = 'public'
      and post.status = 'active'
      and not post.is_hidden
      and post.id <> all(coalesce(p_excluded_post_ids, array[]::uuid[]))
      and post.user_id <> all(coalesce(p_excluded_user_ids, array[]::uuid[]))
  )
  select
    eligible.id,
    (
      (eligible.likes_count * 2 + eligible.comments_count * 3)
      / power(
          greatest(
            extract(epoch from (statement_timestamp() - eligible.created_at)) / 3600.0,
            0
          ) + 2,
          1.5
        )
    )::double precision
  from eligible_posts as eligible
  order by 2 desc, eligible.created_at desc, eligible.id desc
  limit greatest(least(coalesce(p_limit, 10), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_smart_global_feed(uuid[], uuid[], integer, integer) from public;
grant execute on function public.get_smart_global_feed(uuid[], uuid[], integer, integer) to anon, authenticated;

create index if not exists likes_post_id_smart_feed_idx on public.likes (post_id);
