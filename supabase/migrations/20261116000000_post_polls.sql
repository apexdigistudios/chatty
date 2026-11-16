alter table public.posts
  add column if not exists has_poll boolean not null default false;
alter table public.posts
  drop constraint if exists posts_content_check;
alter table public.posts
  add constraint posts_content_check check (
    char_length(content) between 1 and 300
    or (char_length(content) = 0 and (media_url is not null or has_poll))
  );

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 160),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 80),
  sort_order integer not null,
  vote_count integer not null default 0 check (vote_count >= 0),
  constraint poll_options_id_poll_unique unique (id, poll_id),
  constraint poll_options_sort_order_unique unique (poll_id, sort_order)
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint poll_votes_one_per_user unique (poll_id, user_id),
  constraint poll_votes_option_poll_fkey
    foreign key (option_id, poll_id)
    references public.poll_options (id, poll_id)
    on delete cascade
);

create index if not exists poll_options_poll_sort_idx
  on public.poll_options (poll_id, sort_order);
create index if not exists poll_votes_poll_idx
  on public.poll_votes (poll_id);

do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'poll_options'
  ) then
    alter publication supabase_realtime add table public.poll_options;
  end if;
end;
$$;

create or replace function public.update_poll_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.option_id = new.option_id then
    return new;
  end if;
  if tg_op <> 'INSERT' then
    update public.poll_options
    set vote_count = greatest(vote_count - 1, 0)
    where id = old.option_id;
  end if;
  if tg_op <> 'DELETE' then
    update public.poll_options
    set vote_count = vote_count + 1
    where id = new.option_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists poll_votes_update_counts on public.poll_votes;
create trigger poll_votes_update_counts
after insert or update or delete on public.poll_votes
for each row execute function public.update_poll_vote_counts();
revoke all on function public.update_poll_vote_counts() from public, anon, authenticated;

create or replace function public.vote_on_poll(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  voter_id uuid := auth.uid();
begin
  if voter_id is null then
    raise exception 'Sign in to vote in a poll.';
  end if;
  if not exists (
    select 1
    from public.polls poll
    join public.posts post on post.id = poll.post_id
    where poll.id = p_poll_id
      and post.post_type = 'public'
      and post.status = 'active'
  ) then
    raise exception 'This poll is not available.';
  end if;
  if not exists (
    select 1 from public.poll_options option
    where option.id = p_option_id and option.poll_id = p_poll_id
  ) then
    raise exception 'Choose an option from this poll.';
  end if;
  insert into public.poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, voter_id)
  on conflict (poll_id, user_id)
  do update set option_id = excluded.option_id
  where public.poll_votes.option_id <> excluded.option_id;
end;
$$;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "polls: read visible public posts" on public.polls;
create policy "polls: read visible public posts" on public.polls
  for select using (
    exists (
      select 1 from public.posts post
      where post.id = polls.post_id
        and post.post_type = 'public'
        and (
          post.status = 'active'
          or post.user_id = (select auth.uid())
          or public.is_school_moderator(post.school_id)
          or public.is_global_admin()
        )
    )
  );

drop policy if exists "poll options: read visible public posts" on public.poll_options;
create policy "poll options: read visible public posts" on public.poll_options
  for select using (
    exists (
      select 1
      from public.polls poll
      join public.posts post on post.id = poll.post_id
      where poll.id = poll_options.poll_id
        and post.post_type = 'public'
        and (
          post.status = 'active'
          or post.user_id = (select auth.uid())
          or public.is_school_moderator(post.school_id)
          or public.is_global_admin()
        )
    )
  );

drop policy if exists "poll votes: users read own vote" on public.poll_votes;
create policy "poll votes: users read own vote" on public.poll_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.polls, public.poll_options, public.poll_votes from anon, authenticated;
grant select on public.polls, public.poll_options to anon, authenticated;
grant select on public.poll_votes to authenticated;
grant all on public.polls, public.poll_options, public.poll_votes to service_role;

revoke all on function public.vote_on_poll(uuid, uuid) from public, anon;
grant execute on function public.vote_on_poll(uuid, uuid) to authenticated;
