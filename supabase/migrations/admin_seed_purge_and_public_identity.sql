create or replace function public.admin_clear_all_seed_data()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  media_urls text[];
begin
  if not public.is_global_admin() then
    raise exception 'Unauthorized';
  end if;

  select coalesce(array_agg(distinct media.url), array[]::text[])
  into media_urls
  from (
    select pm.media_url as url
    from public.posts p
    join public.post_media pm on pm.post_id = p.id
    where p.seed_profile_id is not null
    union
    select cm.media_url as url
    from public.confessions c
    join public.confession_media cm on cm.confession_id = c.id
    where c.seed_profile_id is not null
  ) media;

  delete from public.confession_media cm
  where cm.confession_id in (
    select c.id from public.confessions c where c.seed_profile_id is not null
  );
  delete from public.post_media pm
  where pm.post_id in (
    select p.id from public.posts p where p.seed_profile_id is not null
  );
  delete from public.confessions where seed_profile_id is not null;
  delete from public.posts where seed_profile_id is not null;
  delete from public.admin_seed_profiles;

  return media_urls;
end;
$$;

revoke all on function public.admin_clear_all_seed_data() from public;
grant execute on function public.admin_clear_all_seed_data() to authenticated;
