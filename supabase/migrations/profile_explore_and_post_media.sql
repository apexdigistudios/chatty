-- Multi-attachment posts, popularity counts, and the expanded confession reactions.
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  video_duration_seconds integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_sort_idx
  on public.post_media (post_id, sort_order);

alter table public.post_media enable row level security;
drop policy if exists "post media: read visible posts" on public.post_media;
create policy "post media: read visible posts" on public.post_media
  for select using (
    exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
        and (
          posts.status = 'active'
          or posts.user_id = (select auth.uid())
          or public.is_school_moderator(posts.school_id)
          or public.is_global_admin()
        )
    )
  );
drop policy if exists "post media: author create" on public.post_media;
create policy "post media: author create" on public.post_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
        and posts.user_id = (select auth.uid())
    )
  );
grant select on public.post_media to anon, authenticated;
grant insert on public.post_media to authenticated;
grant all on public.post_media to service_role;

drop policy if exists "posts: own or moderator delete" on public.posts;
create policy "posts: own or moderator delete" on public.posts
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_school_moderator(school_id)
    or public.is_global_admin()
  );

create or replace view public.profile_follow_counts as
select following_id as profile_id, count(*)::bigint as followers_count
from public.follows
group by following_id;
grant select on public.profile_follow_counts to anon, authenticated;

create or replace view public.post_like_counts
with (security_invoker = true) as
select posts.id as post_id, count(likes.id)::bigint as likes_count
from public.posts
left join public.likes on likes.post_id = posts.id
group by posts.id;
grant select on public.post_like_counts to anon, authenticated;

alter table public.confession_reactions
  drop constraint if exists confession_reactions_kind_check;
update public.confession_reactions
set kind = case kind
  when 'relatable' then 'like'
  when 'shock' then 'surprised'
  else kind
end;
alter table public.confession_reactions
  add constraint confession_reactions_kind_check
  check (kind in ('like', 'heart', 'fire', 'laugh', 'clap', 'surprised'));
