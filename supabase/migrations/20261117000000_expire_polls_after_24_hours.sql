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
      and poll.created_at > now() - interval '24 hours'
  ) then
    raise exception 'This poll is not available or has expired.';
  end if;
  if not exists (
    select 1
    from public.poll_options option
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

drop policy if exists "polls: read visible public posts" on public.polls;
create policy "polls: read visible public posts" on public.polls
  for select using (
    exists (
      select 1
      from public.posts post
      where post.id = polls.post_id
        and post.post_type = 'public'
        and polls.created_at > now() - interval '24 hours'
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
        and poll.created_at > now() - interval '24 hours'
        and (
          post.status = 'active'
          or post.user_id = (select auth.uid())
          or public.is_school_moderator(post.school_id)
          or public.is_global_admin()
        )
    )
  );
