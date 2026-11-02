-- ============================================================================
--  Let's Gist · Step 07 migration for the EXISTING project
--  (wemdjlyxorixmknfruam — already has schools/profiles/posts/… with live data)
--
--  Purely additive and idempotent. Run the whole file in the SQL Editor.
--  It does NOT recreate or alter the shape of your existing tables.
--
--  Adds:
--   1. is_school_moderator()  – founder/appointed-moderator check used by policies
--   2. claim_school()          – first student to claim a seeded school moderates it
--   3. on_school_created       – founders are auto-registered in admin_roles
--   4. confession_reactions    – Laugh / Shock / Heart / Relatable
--   5. School-moderator policies on posts, comments and reports (campus-scoped)
--   6. Eight well-known Ghanaian SHS communities (unclaimed; founder = first claimer)
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1 ─ Moderator helpers ------------------------------------------------------

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

grant execute on function public.is_global_admin(uuid) to anon, authenticated;
grant execute on function public.is_school_moderator(uuid, uuid) to anon, authenticated;

-- 2 ─ Claim an unclaimed community -------------------------------------------

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

-- 3 ─ Founder → moderator trigger ---------------------------------------------

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

-- Back-fill: existing founders (e.g. Akuse Methodist) get their moderator role.
insert into public.admin_roles (user_id, role, school_id)
select s.creator_id, 'school_moderator', s.id
from public.schools s
where s.creator_id is not null
  and not exists (
    select 1 from public.admin_roles ar
    where ar.user_id = s.creator_id and ar.role = 'school_moderator' and ar.school_id = s.id
  );

-- 4 ─ Confession reactions ----------------------------------------------------

create table if not exists public.confession_reactions (
  id             uuid primary key default gen_random_uuid(),
  confession_id  uuid not null references public.confessions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind in ('laugh','shock','heart','relatable')),
  created_at     timestamptz not null default now(),
  unique (confession_id, user_id)
);
create index if not exists reactions_confession_idx on public.confession_reactions (confession_id);

alter table public.confession_reactions enable row level security;

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

-- 5 ─ Campus-scoped moderator policies ---------------------------------------
-- Permissive policies only ADD access alongside whatever already exists.

drop policy if exists "posts: moderators read"          on public.posts;
drop policy if exists "posts: moderators update"        on public.posts;
drop policy if exists "posts: moderators delete"        on public.posts;
drop policy if exists "comments: moderators delete"     on public.comments;
drop policy if exists "reports: school moderators read" on public.reports;
drop policy if exists "reports: school moderators resolve" on public.reports;

create policy "posts: moderators read" on public.posts
  for select to authenticated
  using (public.is_school_moderator(school_id) or public.is_global_admin());
create policy "posts: moderators update" on public.posts
  for update to authenticated
  using (public.is_school_moderator(school_id) or public.is_global_admin())
  with check (public.is_school_moderator(school_id) or public.is_global_admin());
create policy "posts: moderators delete" on public.posts
  for delete to authenticated
  using (public.is_school_moderator(school_id) or public.is_global_admin());

create policy "comments: moderators delete" on public.comments
  for delete to authenticated
  using (
    public.is_global_admin()
    or exists (select 1 from public.posts p where p.id = post_id and public.is_school_moderator(p.school_id))
  );

create policy "reports: school moderators read" on public.reports
  for select to authenticated
  using (school_id is not null and public.is_school_moderator(school_id));
create policy "reports: school moderators resolve" on public.reports
  for update to authenticated
  using (school_id is not null and public.is_school_moderator(school_id))
  with check (school_id is not null and public.is_school_moderator(school_id));

-- 6 ─ Seed well-known communities (skip any that already exist) ---------------
-- creator_id stays NULL → the first student to "Claim & moderate" becomes founder.

insert into public.schools (name, region, school_type, crest_url)
select v.name, v.region, v.school_type, v.crest_url
from (values
  ('Presbyterian Boys'' Senior High School', 'Greater Accra Region', 'public',
   'https://upload.wikimedia.org/wikipedia/en/4/44/Presbyterian_boys_secondary_logo_2.png'),
  ('Achimota School',                        'Greater Accra Region', 'public',
   'https://upload.wikimedia.org/wikipedia/en/6/6f/Achimota_School_crest.png'),
  ('Mfantsipim School',                      'Central Region',       'public',
   'https://upload.wikimedia.org/wikipedia/commons/e/eb/Mfantsipim-School-Logo-1-300x274.png'),
  ('Wesley Girls'' Senior High School',      'Central Region',       'public', null),
  ('Adisadel College',                       'Central Region',       'public',
   'https://upload.wikimedia.org/wikipedia/en/6/68/Crest_orig.gif'),
  ('Prempeh College',                        'Ashanti Region',       'public',
   'https://upload.wikimedia.org/wikipedia/commons/5/5e/Prempeh_College_Crest.jpg'),
  ('Opoku Ware School',                      'Ashanti Region',       'public',
   'https://upload.wikimedia.org/wikipedia/commons/7/73/Opoku_Ware_School_crest.png'),
  ('St. Peter''s Boys Senior High School',   'Eastern Region',       'public',
   'https://upload.wikimedia.org/wikipedia/en/9/9f/St._Peter%27s_Boys_Senior_High_School_logo.png')
) as v(name, region, school_type, crest_url)
where not exists (select 1 from public.schools s where lower(s.name) = lower(v.name));

-- ──────────────────── Make yourself a Global Admin ─────────────────────────
-- insert into public.admin_roles (user_id, role)
-- select id, 'global_admin' from public.profiles where username = 'Marshmello'
-- on conflict do nothing;
