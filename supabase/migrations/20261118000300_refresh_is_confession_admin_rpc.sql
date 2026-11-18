create or replace function public.is_confession_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user_id is not null
    and (p_user_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
    and (
      exists (
        select 1
        from public.profiles p
        where p.id = p_user_id and p.is_admin is true
      )
      or public.is_global_admin(p_user_id)
    ),
    false
  );
$$;

revoke all on function public.is_confession_admin(uuid) from public, anon;
grant execute on function public.is_confession_admin(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
