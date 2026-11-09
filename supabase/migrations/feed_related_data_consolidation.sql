-- Include confession comment counts in the existing public read so clients do
-- not need a separate confession_comments request for every feed batch.
create or replace view public.public_confessions as
  select
    c.id,
    c.school_id,
    c.category,
    c.content,
    c.created_at,
    c.published_at,
    case when not c.is_anonymous then s.username else null end as seed_username,
    case when not c.is_anonymous then s.full_name else null end as seed_full_name,
    case when not c.is_anonymous then s.avatar_url else null end as seed_avatar_url,
    (not c.is_anonymous and s.id is not null) as is_seed,
    coalesce((
      select array_agg(cm.media_url order by cm.sort_order)
      from public.confession_media cm where cm.confession_id = c.id
    ), array[]::text[]) as media_urls,
    coalesce((
      select array_agg(cm.media_type order by cm.sort_order)
      from public.confession_media cm where cm.confession_id = c.id
    ), array[]::text[]) as media_types,
    (
      select count(*)::bigint
      from public.confession_comments cc
      where cc.confession_id = c.id
    ) as comment_count,
    sch.name as school_name,
    sch.logo_url as school_crest_url
  from public.confessions c
  left join public.admin_seed_profiles s on s.id = c.seed_profile_id
  left join public.schools sch on sch.id = c.school_id
  where c.moderation_status = 'approved';

grant select on public.public_confessions to anon, authenticated;
