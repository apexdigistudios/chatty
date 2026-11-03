-- Social follow graph and authenticated post-share counts for personalized feed ranking.
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_unique_follower_following unique (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx
  on public.follows (following_id);

alter table public.follows enable row level security;

drop policy if exists "follows: public read" on public.follows;
create policy "follows: public read" on public.follows
  for select using (true);

drop policy if exists "follows: own create" on public.follows;
create policy "follows: own create" on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));

drop policy if exists "follows: own delete" on public.follows;
create policy "follows: own delete" on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

revoke all on table public.follows from anon, authenticated;
grant select on table public.follows to anon, authenticated;
grant insert, delete on table public.follows to authenticated;
grant all on table public.follows to service_role;

-- A unique share per signed-in user/post gives ranking a stable engagement signal.
create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_shares_unique_post_user unique (post_id, user_id)
);

create index if not exists post_shares_post_id_idx
  on public.post_shares (post_id);

alter table public.post_shares enable row level security;

drop policy if exists "post shares: public read" on public.post_shares;
create policy "post shares: public read" on public.post_shares
  for select using (true);

drop policy if exists "post shares: own create" on public.post_shares;
create policy "post shares: own create" on public.post_shares
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on table public.post_shares from anon, authenticated;
grant select on table public.post_shares to anon, authenticated;
grant insert on table public.post_shares to authenticated;
grant all on table public.post_shares to service_role;
