alter table public.posts
  alter column school_id drop not null;

drop policy if exists "posts: own insert" on public.posts;
create policy "posts: own insert" on public.posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (school_id is not null or public.is_global_admin())
  );

drop policy if exists "posts: group must match school" on public.posts;
create policy "posts: group must match school" on public.posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (school_id is not null or public.is_global_admin())
    and (
      group_id is null
      or exists (
        select 1
        from public.school_groups g
        where g.id = public.posts.group_id and g.school_id = public.posts.school_id
      )
    )
  );
