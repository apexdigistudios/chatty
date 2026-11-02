-- ============================================================================
--  Let's Gist · Step 09 Migration
--  UX refinements: sub-communities (groups/clubs), group posts,
--  smart trending (>= 1,000 likes) and the permanent school identity lock.
--
--  Additive & idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─────────────────────── Sub-communities (clubs/gengs) ──────────────────────

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

create index if not exists school_groups_school_idx on public.school_groups (school_id, created_at desc);
create index if not exists school_groups_creator_idx on public.school_groups (created_by);

create table if not exists public.group_memberships (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.school_groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_memberships_group_idx on public.group_memberships (group_id);
create index if not exists group_memberships_user_idx on public.group_memberships (user_id);

-- A gist can optionally be filed under one club/squad.
alter table public.posts
  add column if not exists group_id uuid references public.school_groups (id) on delete set null;

create index if not exists posts_group_created_idx on public.posts (group_id, created_at desc);

-- ─────────────────────── Like counts view (smart trending) ────────────────────
-- security_invoker keeps the caller's RLS on posts; anon may only count visible rows.

create or replace view public.post_like_counts
with (security_invoker = true) as
  select p.id as post_id, count(l.id)::bigint as likes_count
  from public.posts p
  left join public.likes l on l.post_id = p.id
  group by p.id;

grant select on public.post_like_counts to anon, authenticated;

-- ─────────────────────────────── RLS: groups ────────────────────────────────

alter table public.school_groups enable row level security;
alter table public.group_memberships enable row level security;

drop policy if exists "school_groups: public read"        on public.school_groups;
drop policy if exists "school_groups: authenticated create" on public.school_groups;
drop policy if exists "school_groups: creator or moderator update" on public.school_groups;
drop policy if exists "school_groups: creator or moderator delete" on public.school_groups;

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

drop policy if exists "group_memberships: public read"   on public.group_memberships;
drop policy if exists "group_memberships: own join"      on public.group_memberships;
drop policy if exists "group_memberships: own leave"     on public.group_memberships;
drop policy if exists "group_memberships: creator remove" on public.group_memberships;

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

-- Authors must be able to soft-delete their own gists (status = 'removed').
drop policy if exists "posts: author update own" on public.posts;
create policy "posts: author update own" on public.posts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Posts may only be attached to a club inside the same school.
drop policy if exists "posts: group must match school" on public.posts;
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
-- A student's SHS is chosen once. Global admins can still correct mistakes.

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

-- ────────────────────────────── Storage / realtime ──────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime add table public.school_groups;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.group_memberships;
  exception when duplicate_object then null; end;
end $$;
