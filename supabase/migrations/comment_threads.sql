-- Comment threads on public posts and approved anonymous confessions.
alter table public.comments
  add column if not exists parent_id uuid;

create unique index if not exists comments_id_post_unique
  on public.comments (id, post_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_parent_same_post_fk'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_parent_same_post_fk
      foreign key (parent_id, post_id)
      references public.comments (id, post_id)
      on delete cascade;
  end if;
end
$$;

create table if not exists public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists public.confession_comments (
  id            uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions (id) on delete cascade,
  parent_id     uuid,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  content       text not null check (char_length(content) between 1 and 220),
  created_at    timestamptz not null default now(),
  unique (id, confession_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'confession_comments_parent_same_thread_fk'
      and conrelid = 'public.confession_comments'::regclass
  ) then
    alter table public.confession_comments
      add constraint confession_comments_parent_same_thread_fk
      foreign key (parent_id, confession_id)
      references public.confession_comments (id, confession_id)
      on delete cascade;
  end if;
end
$$;

create table if not exists public.confession_comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.confession_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists confession_comments_thread_idx
  on public.confession_comments (confession_id, created_at);
create index if not exists confession_comments_parent_idx
  on public.confession_comments (parent_id);

alter table public.comment_likes enable row level security;
alter table public.confession_comments enable row level security;
alter table public.confession_comment_likes enable row level security;

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

grant select, insert, delete on public.comment_likes to anon, authenticated;
grant select, insert, delete on public.confession_comments to anon, authenticated;
grant select, insert, delete on public.confession_comment_likes to anon, authenticated;
