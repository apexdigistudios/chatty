-- ============================================================================
--  Gist me · Supabase Schema (Step 07)
--  FRESH PROJECTS ONLY. For the existing wemdjlyxorixmknfruam project (which
--  already has these tables with live data) run migration-step7.sql instead.
--  Run this whole file in the Supabase SQL Editor. It is idempotent.
--
--  Moderation model
--  ───────────────
--  • The user who creates a school community becomes its primary moderator
--    (schools.creator_id). Extra moderators can be added in admin_roles.
--  • School moderators may flag/remove posts and delete comments tagged with
--    their school_id, and resolve reports routed to their school.
--  • Global admins (admin_roles.role = 'global_admin') own the anonymous
--    confession queue and every report system-wide.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ───────────────────────────── Tables ──────────────────────────────────────

create table if not exists public.schools (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(name) between 3 and 80),
  region       text not null,
  school_type  text not null default 'public'
               check (school_type in ('public','private','mission','technical')),
  crest_url    text,
  logo_url     text,
  creator_id   uuid,                               -- FK added after profiles
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique,
  school_id   uuid references public.schools (id) on delete set null,
  avatar_url  text,
  cover_url   text,
  bio         text not null default '' check (char_length(bio) <= 160),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_username_length_check check (char_length(username) between 3 and 24)
);

alter table public.schools
  drop constraint if exists schools_creator_id_fkey;
alter table public.schools
  add constraint schools_creator_id_fkey
  foreign key (creator_id) references public.profiles (id) on delete set null;

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  school_id   uuid not null references public.schools (id) on delete cascade,
  confession_id uuid,                              -- optional link when a confession is promoted to a post
  content     text not null check (
    char_length(content) between 1 and 300
    or (char_length(content) = 0 and media_url is not null)
  ),
  media_url   text,
  video_thumbnail_url text,
  post_type   text not null default 'public' check (post_type in ('public','confession')),
  status      text not null default 'active' check (status in ('active','flagged','removed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  parent_id   uuid,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 220),
  created_at  timestamptz not null default now(),
  unique (id, post_id),
  foreign key (parent_id, post_id) references public.comments (id, post_id) on delete cascade
);

create table if not exists public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (post_id, user_id)
);

-- author_id is stored for abuse handling but is NEVER exposed publicly:
-- anonymous readers only ever see the public_confessions view below.
create table if not exists public.confessions (
  id                 uuid primary key default gen_random_uuid(),
  author_id          uuid references public.profiles (id) on delete set null,
  school_id          uuid references public.schools (id) on delete set null,
  category           text not null default 'School Secret'
                     check (category in ('Crush Confession','School Secret','Relationship Gist','Friendship Gist')),
  content            text not null check (char_length(content) between 1 and 300),
  moderation_status  text not null default 'pending'
                     check (moderation_status in ('pending','approved','rejected')),
  reviewed_by        uuid references public.profiles (id) on delete set null,
  rejection_reason   text,
  created_at         timestamptz not null default now(),
  published_at       timestamptz
);

create table if not exists public.confession_comments (
  id            uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions (id) on delete cascade,
  parent_id     uuid,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  content       text not null check (char_length(content) between 1 and 220),
  created_at    timestamptz not null default now(),
  unique (id, confession_id),
  foreign key (parent_id, confession_id)
    references public.confession_comments (id, confession_id) on delete cascade
);

create table if not exists public.confession_comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.confession_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists public.confession_reactions (
  id             uuid primary key default gen_random_uuid(),
  confession_id  uuid not null references public.confessions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind in ('like','heart','fire','laugh','clap','surprised')),
  created_at     timestamptz not null default now(),
  unique (confession_id, user_id)
);

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('post','comment','confession')),
  target_id    uuid not null,
  school_id    uuid references public.schools (id) on delete set null,  -- local routing
  reason       text not null check (char_length(reason) between 2 and 200),
  status       text not null default 'pending' check (status in ('pending','resolved')),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.admin_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('global_admin','school_moderator')),
  school_id   uuid references public.schools (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint admin_roles_scope check (
    (role = 'global_admin' and school_id is null) or
    (role = 'school_moderator' and school_id is not null)
  ),
  unique (user_id, role, school_id)
);
create unique index if not exists admin_roles_one_global_per_user
  on public.admin_roles (user_id) where role = 'global_admin';

create table if not exists public.user_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  constraint user_blocks_blocker_blocked_unique unique (blocker_id, blocked_id)
);
create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

create table if not exists public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint follows_unique_follower_following unique (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create table if not exists public.post_shares (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_shares_unique_post_user unique (post_id, user_id)
);

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  video_duration_seconds integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ────────────────── Sub-communities (clubs, squads, gengs) ──────────────────

create table if not exists public.school_groups (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 48),
  description text not null default '' check (char_length(description) <= 160),
  emoji       text not null default '👥' check (char_length(emoji) <= 8),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.group_memberships (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.school_groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

alter table public.posts
  add column if not exists group_id uuid references public.school_groups (id) on delete set null;

-- ───────────────────────────── Indexes ─────────────────────────────────────

create index if not exists posts_school_created_idx      on public.posts (school_id, created_at desc);
create unique index if not exists idx_schools_unique_normalized_name
  on public.schools (lower(btrim(name)));
create index if not exists posts_user_created_idx        on public.posts (user_id, created_at desc);
create index if not exists posts_feed_idx                on public.posts (status, post_type, created_at desc);
create index if not exists comments_post_created_idx     on public.comments (post_id, created_at);
create index if not exists comments_parent_idx            on public.comments (parent_id);
create index if not exists confession_comments_thread_idx on public.confession_comments (confession_id, created_at);
create index if not exists confession_comments_parent_idx on public.confession_comments (parent_id);
create index if not exists likes_user_created_idx        on public.likes (user_id, created_at desc);
create index if not exists confessions_queue_idx         on public.confessions (moderation_status, created_at desc);
create index if not exists confessions_published_idx     on public.confessions (published_at desc) where moderation_status = 'approved';
create index if not exists confessions_author_idx        on public.confessions (author_id);
create index if not exists reactions_confession_idx      on public.confession_reactions (confession_id);
create index if not exists reports_school_status_idx     on public.reports (school_id, status, created_at desc);
create index if not exists reports_status_created_idx    on public.reports (status, created_at desc);
create index if not exists admin_roles_user_idx          on public.admin_roles (user_id);
create index if not exists profiles_school_idx           on public.profiles (school_id);
create index if not exists follows_following_id_idx       on public.follows (following_id);
create index if not exists post_shares_post_id_idx        on public.post_shares (post_id);
create index if not exists post_media_post_sort_idx       on public.post_media (post_id, sort_order);

create or replace view public.profile_follow_counts as
select following_id as profile_id, count(*)::bigint as followers_count
from public.follows
group by following_id;

-- ─────────────────────── Authorization helpers ─────────────────────────────
-- SECURITY DEFINER so policies can consult admin_roles/schools without
-- recursing into their own RLS.

create or replace function public.is_global_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    uid is not null and exists (
      select 1 from public.admin_roles ar
      where ar.user_id = uid and ar.role = 'global_admin'
    ), false);
$$;

create or replace function public.is_school_moderator(target_school uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    uid is not null and target_school is not null and (
      exists (select 1 from public.schools s where s.id = target_school and s.creator_id = uid)
      or exists (
        select 1 from public.admin_roles ar
        where ar.user_id = uid and ar.role = 'school_moderator' and ar.school_id = target_school
      )
    ), false);
$$;

revoke all on function public.is_global_admin(uuid) from public;
revoke all on function public.is_school_moderator(uuid, uuid) from public;
grant execute on function public.is_global_admin(uuid) to anon, authenticated;
grant execute on function public.is_school_moderator(uuid, uuid) to anon, authenticated;

-- ─────────────────────────── Triggers ──────────────────────────────────────

-- 1) Every new auth user gets a profile (username + school from signup metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  base_username    text;
  candidate        text;
  requested_school uuid;
  pending_school_name text;
  pending_school_region text;
  pending_school_type text;
  attempt          int := 0;
begin
  base_username := nullif(new.raw_user_meta_data->>'username', '');
  if base_username is null or char_length(base_username) < 3 or char_length(base_username) > 24 then
    base_username := lower(regexp_replace(
      coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'student'),
      '[^A-Za-z0-9_]', '', 'g'));
    if char_length(base_username) < 3 then
      base_username := 'student' || substr(replace(new.id::text, '-', ''), 1, 6);
    end if;
  end if;
  base_username := left(base_username, 24);
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
        coalesce(
          nullif(new.raw_user_meta_data->>'avatar_url', ''),
          'https://api.dicebear.com/9.x/notionists/svg?seed=' || candidate || '&backgroundColor=ede9fe'
        ),
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) The founder of a school community is registered as its moderator.
create or replace function public.handle_new_school()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.creator_id is not null then
    insert into public.admin_roles (user_id, role, school_id)
    values (new.creator_id, 'school_moderator', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_school_created on public.schools;
create trigger on_school_created
  after insert on public.schools
  for each row execute function public.handle_new_school();

-- 3) Seeded communities have no founder yet; the first student to claim one
--    becomes its moderator (decentralised bootstrap).
create or replace function public.claim_school(target_school uuid)
returns public.schools
language plpgsql security definer set search_path = public
as $$
declare
  claimed public.schools;
begin
  if auth.uid() is null then
    raise exception 'Sign in to claim a community.';
  end if;
  update public.schools
     set creator_id = auth.uid()
   where id = target_school and creator_id is null
  returning * into claimed;
  if claimed.id is null then
    raise exception 'This community already has a moderator.';
  end if;
  insert into public.admin_roles (user_id, role, school_id)
  values (auth.uid(), 'school_moderator', claimed.id)
  on conflict do nothing;
  return claimed;
end;
$$;
grant execute on function public.claim_school(uuid) to authenticated;

-- ───────────────────── Anonymous confession view ───────────────────────────
-- Intentionally NOT security_invoker: it is the only public read path for
-- confessions and it strips author_id so anonymity is enforced in the DB.
create or replace view public.public_confessions as
  select c.id, c.school_id, c.category, c.content, c.created_at, c.published_at
  from public.confessions c
  where c.moderation_status = 'approved';

grant select on public.public_confessions to anon, authenticated;

-- ─────────────────── Like counts (smart trending ≥ 1,000) ──────────────────
create or replace view public.post_like_counts
with (security_invoker = true) as
  select p.id as post_id, count(l.id)::bigint as likes_count
  from public.posts p
  left join public.likes l on l.post_id = p.id
  group by p.id;

grant select on public.post_like_counts to anon, authenticated;


-- ───────────────────────── Row Level Security ──────────────────────────────

alter table public.schools              enable row level security;
alter table public.profiles             enable row level security;
alter table public.posts                enable row level security;
alter table public.comments             enable row level security;
alter table public.comment_likes        enable row level security;
alter table public.likes                enable row level security;
alter table public.confessions          enable row level security;
alter table public.confession_reactions enable row level security;
alter table public.confession_comments  enable row level security;
alter table public.confession_comment_likes enable row level security;
alter table public.reports              enable row level security;
alter table public.admin_roles          enable row level security;
alter table public.user_blocks          enable row level security;
alter table public.follows               enable row level security;
alter table public.post_shares           enable row level security;
alter table public.post_media            enable row level security;

-- schools ------------------------------------------------------------------
drop policy if exists "schools: public read"            on public.schools;
drop policy if exists "schools: founders create"        on public.schools;
drop policy if exists "schools: moderators update"      on public.schools;
drop policy if exists "schools: global admins delete"   on public.schools;

create policy "schools: public read" on public.schools
  for select using (true);
create policy "schools: founders create" on public.schools
  for insert to authenticated with check (creator_id = auth.uid());
create policy "schools: moderators update" on public.schools
  for update to authenticated
  using (public.is_school_moderator(id) or public.is_global_admin())
  with check (public.is_school_moderator(id) or public.is_global_admin());
create policy "schools: global admins delete" on public.schools
  for delete to authenticated using (public.is_global_admin());

-- profiles -----------------------------------------------------------------
drop policy if exists "profiles: public read"       on public.profiles;
drop policy if exists "profiles: own insert"        on public.profiles;
drop policy if exists "profiles: own update"        on public.profiles;

create policy "profiles: public read" on public.profiles
  for select using (true);
create policy "profiles: own insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: own update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_global_admin())
  with check (id = auth.uid() or public.is_global_admin());

-- user blocks ----------------------------------------------------------------
drop policy if exists "user blocks: involved user read" on public.user_blocks;
drop policy if exists "user blocks: own create" on public.user_blocks;
drop policy if exists "user blocks: own delete" on public.user_blocks;

create policy "user blocks: involved user read" on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));
create policy "user blocks: own create" on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "user blocks: own delete" on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on table public.user_blocks from anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant all on table public.user_blocks to service_role;

-- follows -----------------------------------------------------------------
drop policy if exists "follows: public read" on public.follows;
drop policy if exists "follows: own create" on public.follows;
drop policy if exists "follows: own delete" on public.follows;

create policy "follows: public read" on public.follows
  for select using (true);
create policy "follows: own create" on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "follows: own delete" on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

revoke all on table public.follows from anon, authenticated;
grant select on table public.follows to anon, authenticated;
grant insert, delete on table public.follows to authenticated;
grant all on table public.follows to service_role;

-- post shares -------------------------------------------------------------
drop policy if exists "post shares: public read" on public.post_shares;
drop policy if exists "post shares: own create" on public.post_shares;

create policy "post shares: public read" on public.post_shares
  for select using (true);
create policy "post shares: own create" on public.post_shares
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on table public.post_shares from anon, authenticated;
grant select on table public.post_shares to anon, authenticated;
grant insert on table public.post_shares to authenticated;
grant all on table public.post_shares to service_role;

-- post media ---------------------------------------------------------------
drop policy if exists "post media: read visible posts" on public.post_media;
drop policy if exists "post media: author create" on public.post_media;

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
create policy "post media: author create" on public.post_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
        and posts.user_id = (select auth.uid())
    )
  );
grant select on table public.post_media to anon, authenticated;
grant insert on table public.post_media to authenticated;
grant all on table public.post_media to service_role;
grant select on public.profile_follow_counts to anon, authenticated;

-- posts --------------------------------------------------------------------
drop policy if exists "posts: read active or privileged" on public.posts;
drop policy if exists "posts: own insert"                on public.posts;
drop policy if exists "posts: own update"                on public.posts;
drop policy if exists "posts: moderators update"         on public.posts;
drop policy if exists "posts: own or moderator delete"   on public.posts;

create policy "posts: read active or privileged" on public.posts
  for select using (
    status = 'active'
    or user_id = auth.uid()
    or public.is_school_moderator(school_id)
    or public.is_global_admin()
  );
create policy "posts: own insert" on public.posts
  for insert to authenticated with check (user_id = auth.uid());
create policy "posts: own update" on public.posts
  for update to authenticated
  using (user_id = auth.uid() and status <> 'removed')
  with check (user_id = auth.uid());
create policy "posts: moderators update" on public.posts
  for update to authenticated
  using (public.is_school_moderator(school_id) or public.is_global_admin())
  with check (public.is_school_moderator(school_id) or public.is_global_admin());
create policy "posts: own or moderator delete" on public.posts
  for delete to authenticated
  using (user_id = auth.uid() or public.is_school_moderator(school_id) or public.is_global_admin());

-- comments -----------------------------------------------------------------
drop policy if exists "comments: read on visible posts"   on public.comments;
drop policy if exists "comments: own insert"              on public.comments;
drop policy if exists "comments: own update"              on public.comments;
drop policy if exists "comments: own or moderator delete" on public.comments;

create policy "comments: read on visible posts" on public.comments
  for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "comments: own insert" on public.comments
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and p.status = 'active'));
create policy "comments: own update" on public.comments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "comments: own or moderator delete" on public.comments
  for delete to authenticated using (
    user_id = auth.uid()
    or public.is_global_admin()
    or exists (select 1 from public.posts p where p.id = post_id and public.is_school_moderator(p.school_id))
  );

-- comment_likes ------------------------------------------------------------
drop policy if exists "comment likes: public read" on public.comment_likes;
drop policy if exists "comment likes: own insert" on public.comment_likes;
drop policy if exists "comment likes: own delete" on public.comment_likes;
create policy "comment likes: public read" on public.comment_likes
  for select using (true);
create policy "comment likes: own insert" on public.comment_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = comment_id and p.status = 'active'
    )
  );
create policy "comment likes: own delete" on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

-- likes --------------------------------------------------------------------
drop policy if exists "likes: public read" on public.likes;
drop policy if exists "likes: own insert"  on public.likes;
drop policy if exists "likes: own delete"  on public.likes;

create policy "likes: public read" on public.likes for select using (true);
create policy "likes: own insert"  on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes: own delete"  on public.likes for delete to authenticated using (user_id = auth.uid());

-- confessions (table: authors + global admins only; public uses the view) ---
drop policy if exists "confessions: author or admin read"  on public.confessions;
drop policy if exists "confessions: author insert"         on public.confessions;
drop policy if exists "confessions: global admin update"   on public.confessions;
drop policy if exists "confessions: author or admin delete" on public.confessions;

create policy "confessions: author or admin read" on public.confessions
  for select to authenticated using (author_id = auth.uid() or public.is_global_admin());
create policy "confessions: author insert" on public.confessions
  for insert to authenticated with check (
    author_id = auth.uid()
    and (
      moderation_status = 'pending'
      or (moderation_status = 'approved' and public.is_global_admin(auth.uid()))
    )
  );
create policy "confessions: global admin update" on public.confessions
  for update to authenticated using (public.is_global_admin()) with check (public.is_global_admin());
create policy "confessions: author or admin delete" on public.confessions
  for delete to authenticated
  using (public.is_global_admin() or (author_id = auth.uid() and moderation_status = 'pending'));

create or replace function public.admin_update_moderation_status(
  p_item_id uuid,
  p_item_type text,
  p_status text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_published_at timestamptz;
begin
  if not public.is_global_admin(auth.uid()) then
    raise exception 'Global admin access required.';
  end if;

  if p_item_type = 'confession' then
    if p_status is null or p_status not in ('approved', 'rejected') then
      raise exception 'Unsupported confession moderation status: %', p_status;
    end if;

    update public.confessions
    set moderation_status = p_status,
        published_at = case when p_status = 'approved' then now() else null end,
        reviewed_by = auth.uid()
    where id = p_item_id
    returning published_at into v_published_at;
  elsif p_item_type = 'post' then
    if p_status is null or p_status not in ('approved', 'rejected', 'flagged') then
      raise exception 'Unsupported post moderation status: %', p_status;
    end if;

    update public.posts
    set status = case p_status
      when 'approved' then 'active'
      when 'rejected' then 'removed'
      else 'flagged'
    end
    where id = p_item_id
    returning updated_at into v_published_at;
  else
    raise exception 'Unsupported moderation item type: %', p_item_type;
  end if;

  if not found then
    raise exception 'Moderation item not found.';
  end if;

  return v_published_at;
end;
$$;
revoke all on function public.admin_update_moderation_status(uuid, text, text) from public, anon;
grant execute on function public.admin_update_moderation_status(uuid, text, text) to authenticated;

-- confession_comments ------------------------------------------------------
drop policy if exists "confession comments: public read approved" on public.confession_comments;
drop policy if exists "confession comments: own insert" on public.confession_comments;
drop policy if exists "confession comments: own or admin delete" on public.confession_comments;
create policy "confession comments: public read approved" on public.confession_comments
  for select using (
    exists (select 1 from public.public_confessions pc where pc.id = confession_id)
  );
create policy "confession comments: own insert" on public.confession_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.public_confessions pc where pc.id = confession_id)
  );
create policy "confession comments: own or admin delete" on public.confession_comments
  for delete to authenticated using (user_id = auth.uid() or public.is_global_admin());

drop policy if exists "confession comment likes: public read" on public.confession_comment_likes;
drop policy if exists "confession comment likes: own insert" on public.confession_comment_likes;
drop policy if exists "confession comment likes: own delete" on public.confession_comment_likes;
create policy "confession comment likes: public read" on public.confession_comment_likes
  for select using (true);
create policy "confession comment likes: own insert" on public.confession_comment_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.confession_comments cc
      join public.public_confessions pc on pc.id = cc.confession_id
      where cc.id = comment_id
    )
  );
create policy "confession comment likes: own delete" on public.confession_comment_likes
  for delete to authenticated using (user_id = auth.uid());

-- confession_reactions -----------------------------------------------------
drop policy if exists "reactions: public read" on public.confession_reactions;
drop policy if exists "reactions: own insert"  on public.confession_reactions;
drop policy if exists "reactions: own update"  on public.confession_reactions;
drop policy if exists "reactions: own delete"  on public.confession_reactions;

create policy "reactions: public read" on public.confession_reactions for select using (true);
create policy "reactions: own insert" on public.confession_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.public_confessions pc where pc.id = confession_id));
create policy "reactions: own update" on public.confession_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reactions: own delete" on public.confession_reactions
  for delete to authenticated using (user_id = auth.uid());

-- reports ------------------------------------------------------------------
drop policy if exists "reports: reporter, school moderator or admin read" on public.reports;
drop policy if exists "reports: authenticated insert"                    on public.reports;
drop policy if exists "reports: moderator or admin resolve"              on public.reports;

create policy "reports: reporter, school moderator or admin read" on public.reports
  for select to authenticated using (
    reporter_id = auth.uid()
    or public.is_global_admin()
    or (school_id is not null and public.is_school_moderator(school_id))
  );
create policy "reports: authenticated insert" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'pending');
create policy "reports: moderator or admin resolve" on public.reports
  for update to authenticated
  using (public.is_global_admin() or (school_id is not null and public.is_school_moderator(school_id)))
  with check (public.is_global_admin() or (school_id is not null and public.is_school_moderator(school_id)));

-- admin_roles --------------------------------------------------------------
drop policy if exists "admin_roles: own or admin read"  on public.admin_roles;
drop policy if exists "admin_roles: global admin write" on public.admin_roles;

create policy "admin_roles: own or admin read" on public.admin_roles
  for select to authenticated using (user_id = auth.uid() or public.is_global_admin());
create policy "admin_roles: global admin write" on public.admin_roles
  for all to authenticated using (public.is_global_admin()) with check (public.is_global_admin());

-- school_groups -------------------------------------------------------------
alter table public.school_groups enable row level security;
alter table public.group_memberships enable row level security;

drop policy if exists "school_groups: public read"                 on public.school_groups;
drop policy if exists "school_groups: authenticated create"        on public.school_groups;
drop policy if exists "school_groups: creator or moderator update" on public.school_groups;
drop policy if exists "school_groups: creator or moderator delete" on public.school_groups;
drop policy if exists "group_memberships: public read"             on public.group_memberships;
drop policy if exists "group_memberships: own join"                on public.group_memberships;
drop policy if exists "group_memberships: own leave"               on public.group_memberships;
drop policy if exists "group_memberships: creator remove"          on public.group_memberships;
drop policy if exists "posts: group must match school"             on public.posts;

create policy "school_groups: public read" on public.school_groups
  for select using (true);
create policy "school_groups: authenticated create" on public.school_groups
  for insert to authenticated with check (created_by = auth.uid());
create policy "school_groups: creator or moderator update" on public.school_groups
  for update to authenticated
  using (created_by = auth.uid() or public.is_school_moderator(school_id) or public.is_global_admin())
  with check (created_by = auth.uid() or public.is_school_moderator(school_id) or public.is_global_admin());
create policy "school_groups: creator or moderator delete" on public.school_groups
  for delete to authenticated
  using (created_by = auth.uid() or public.is_school_moderator(school_id) or public.is_global_admin());

create policy "group_memberships: public read" on public.group_memberships
  for select using (true);
create policy "group_memberships: own join" on public.group_memberships
  for insert to authenticated with check (user_id = auth.uid());
create policy "group_memberships: own leave" on public.group_memberships
  for delete to authenticated using (user_id = auth.uid());
create policy "group_memberships: creator remove" on public.group_memberships
  for delete to authenticated using (
    exists (
      select 1 from public.school_groups g
      where g.id = group_id
        and (g.created_by = auth.uid() or public.is_school_moderator(g.school_id) or public.is_global_admin())
    )
  );

create policy "posts: group must match school" on public.posts
  for insert to authenticated
  with check (
    group_id is null
    or exists (select 1 from public.school_groups g where g.id = group_id and g.school_id = school_id)
  );


-- Guarantee a gist's club belongs to the same school (belt & braces with RLS).
create or replace function public.validate_post_group_school()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.group_id is not null
     and not exists (
       select 1 from public.school_groups g
       where g.id = new.group_id and g.school_id = new.school_id
     ) then
    raise exception 'The selected club does not belong to this school.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_post_group_school on public.posts;
create trigger validate_post_group_school
  before insert or update of group_id, school_id on public.posts
  for each row execute function public.validate_post_group_school();

-- ─────────────────────── Permanent school identity lock ─────────────────────
create or replace function public.enforce_profile_school_lock()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.school_id is not null
     and new.school_id is distinct from old.school_id
     and not public.is_global_admin(auth.uid()) then
    raise exception 'Your SHS identity is permanently locked. Contact a global admin to correct it.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_school_lock on public.profiles;
create trigger enforce_profile_school_lock
  before update of school_id on public.profiles
  for each row execute function public.enforce_profile_school_lock();

-- ───────────────────────────── Storage ─────────────────────────────────────
-- Public bucket for post photos, avatars and school crests.
-- Object paths are namespaced per user: {auth.uid()}/{posts|avatars|crests|covers}/file

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letsgist-media', 'letsgist-media', true, 8388608,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "letsgist-media: public read"      on storage.objects;
drop policy if exists "letsgist-media: upload own folder" on storage.objects;
drop policy if exists "letsgist-media: owner update"     on storage.objects;
drop policy if exists "letsgist-media: owner delete"     on storage.objects;

create policy "letsgist-media: public read" on storage.objects
  for select using (bucket_id = 'letsgist-media');
create policy "letsgist-media: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'letsgist-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "letsgist-media: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'letsgist-media' and owner = auth.uid());
create policy "letsgist-media: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'letsgist-media' and owner = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-assets', 'school-assets', true, 8388608, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school assets: public read"       on storage.objects;
drop policy if exists "school assets: moderators upload" on storage.objects;
drop policy if exists "school assets: moderators update" on storage.objects;
drop policy if exists "school assets: moderators delete" on storage.objects;

create policy "school assets: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'school-assets');
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

-- ───────────────────────────── Realtime ────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.posts;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.school_groups;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.group_memberships;
  exception when duplicate_object then null; end;
end $$;

-- ──────────────────── Bootstrap your first Global Admin ────────────────────
-- After signing up in the app, run (replace the username):
--
--   insert into public.admin_roles (user_id, role)
--   select id, 'global_admin' from public.profiles where username = 'your_username'
--   on conflict do nothing;


-- ============================================================================
-- Step 10 additions (video metadata, profile identity, shoutout postal system)
-- ============================================================================
-- ============================================================================
--  Gist me · Step 10 Migration
--  Video posts, profile identity extensions, and the digital Shoutout postal system.
--  Additive & idempotent. Run after migration-step9.sql in the Supabase SQL Editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ───────────────────────────── Video post metadata ──────────────────────────
alter table public.posts
  add column if not exists media_type text check (media_type in ('image', 'video')),
  add column if not exists video_duration_seconds integer;

comment on column public.posts.media_type is 'image or video; NULL for legacy image-only gists.';

-- ───────────────────── Optional profile identity (settings only) ─────────────
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists class_form text;

comment on column public.profiles.full_name is 'Optional official name used for open postal shoutouts. Not collected during onboarding.';
comment on column public.profiles.class_form is 'Optional class/form, e.g. Form 2 Science 1.';

-- ───────────────────────── Digital inter-school shoutouts ───────────────────
create table if not exists public.shoutouts (
  id                  uuid primary key default gen_random_uuid(),
  sender_id           uuid not null references public.profiles (id) on delete cascade,
  sender_name         text not null,
  sender_school_id    uuid references public.schools (id) on delete set null,
  recipient_user_id   uuid references public.profiles (id) on delete set null,
  recipient_school_id uuid not null references public.schools (id) on delete cascade,
  recipient_name      text not null check (char_length(recipient_name) between 2 and 80),
  recipient_class     text not null default '',
  message             text not null check (char_length(message) between 1 and 500),
  envelope_theme      text not null default 'school_crest',
  stamp               text not null default 'priority',
  status              text not null default 'in_transit'
                      check (status in ('in_transit', 'arrived', 'delivered')),
  created_at          timestamptz not null default now(),
  arrived_at          timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz
);

create index if not exists shoutouts_sender_created_idx on public.shoutouts (sender_id, created_at desc);
create index if not exists shoutouts_recipient_created_idx on public.shoutouts (recipient_user_id, created_at desc);
create index if not exists shoutouts_recipient_lookup_idx on public.shoutouts (recipient_school_id, recipient_name, recipient_class);
create index if not exists shoutouts_status_idx on public.shoutouts (status, created_at desc);

alter table public.shoutouts enable row level security;

-- Participants can read their own sent mail. Recipients can read mail addressed
-- to their account OR to their exact school + official name + class (open postal lookup).
drop policy if exists "shoutouts: participant read" on public.shoutouts;
create policy "shoutouts: participant read" on public.shoutouts
  for select to authenticated
  using (
    sender_id = auth.uid()
    or recipient_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = recipient_school_id
        and recipient_class = coalesce(p.class_form, '')
        and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
    )
  );

-- Any signed-in student can send mail to any student, no follow required.
drop policy if exists "shoutouts: authenticated send" on public.shoutouts;
create policy "shoutouts: authenticated send" on public.shoutouts
  for insert to authenticated
  with check (sender_id = auth.uid() and status = 'in_transit');

-- Delivery progress can be updated by the sender, recipient, or global admin.
drop policy if exists "shoutouts: participant delivery update" on public.shoutouts;
create policy "shoutouts: participant delivery update" on public.shoutouts
  for update to authenticated
  using (
    sender_id = auth.uid()
    or recipient_user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = recipient_school_id
        and recipient_class = coalesce(p.class_form, '')
        and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
    )
  )
  with check (
    sender_id = auth.uid()
    or recipient_user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = recipient_school_id
        and recipient_class = coalesce(p.class_form, '')
        and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
    )
  );

-- ───────────────────────── Realtime (optional inbox live updates) ────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.shoutouts;
  exception when duplicate_object then null; end;
end $$;
