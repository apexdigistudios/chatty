create or replace view public.post_like_counts
with (security_invoker = true) as
  select
    posts.id as post_id,
    count(likes.id)::bigint + posts.seed_likes_count::bigint as likes_count
  from public.posts
  left join public.likes on likes.post_id = posts.id
  group by posts.id, posts.seed_likes_count;

grant select on public.post_like_counts to anon, authenticated;
