-- Rewrite persisted public Supabase Storage URLs after copying the source
-- buckets into the matching folder prefixes of the unified R2 bucket.
--
-- Audited persisted media columns:
--   profiles.avatar_url, profiles.cover_url
--   schools.crest_url, schools.logo_url
--   posts.media_url, post_media.media_url, confession_media.media_url
--   admin_seed_profiles.avatar_url
--
-- public_confessions.media_urls is a view over confession_media.media_url,
-- so updating the underlying table also updates that view. No media columns
-- were found on comments or shoutouts.
--
-- The source project host is matched dynamically, so no project ref needs to
-- be substituted. Bucket names in the old URL path are preserved, matching
-- the destination keys written by scripts/migrate-to-r2.ts.

begin;

do $migration$
declare
  media_column record;
  column_type text;
  updated_rows bigint;
begin
  for media_column in
    select source.table_name, source.column_name
    from (values
      ('profiles', 'avatar_url'),
      ('profiles', 'cover_url'),
      ('schools', 'crest_url'),
      ('schools', 'logo_url'),
      ('posts', 'media_url'),
      ('post_media', 'media_url'),
      ('confession_media', 'media_url'),
      ('admin_seed_profiles', 'avatar_url')
    ) as source(table_name, column_name)
  loop
    select columns.data_type
      into column_type
    from information_schema.columns as columns
    where columns.table_schema = 'public'
      and columns.table_name = media_column.table_name
      and columns.column_name = media_column.column_name;

    if not found then
      raise notice 'Skipping missing column public.%.%', media_column.table_name, media_column.column_name;
      continue;
    end if;

    if column_type = 'ARRAY' then
      execute format(
        $sql$
          update public.%1$I as target
          set %2$I = (
            select array_agg(
              case
                when media.url like '%%supabase.co/storage/v1/object/public/%%' then
                  replace(
                    media.url,
                    (regexp_match(media.url, 'https?://[^/]+/storage/v1/object/public/'))[1],
                    'https://media.gistme.online/'
                  )
                else media.url
              end
              order by media.ordinality
            )
            from unnest(target.%2$I) with ordinality as media(url, ordinality)
          )
          where exists (
            select 1
            from unnest(target.%2$I) as media(url)
            where media.url like '%%supabase.co/storage/v1/object/public/%%'
          )
        $sql$,
        media_column.table_name,
        media_column.column_name
      );
    elsif column_type in ('text', 'character varying', 'character') then
      execute format(
        $sql$
          update public.%1$I
          set %2$I = replace(
            %2$I,
            (regexp_match(%2$I, 'https?://[^/]+/storage/v1/object/public/'))[1],
            'https://media.gistme.online/'
          )
          where %2$I like '%%supabase.co/storage/v1/object/public/%%'
        $sql$,
        media_column.table_name,
        media_column.column_name
      );
    else
      raise exception 'Unexpected data type % for public.%.%',
        column_type, media_column.table_name, media_column.column_name;
    end if;

    get diagnostics updated_rows = row_count;
    raise notice 'Updated % row(s) in public.%.%', updated_rows,
      media_column.table_name, media_column.column_name;
  end loop;
end
$migration$;

commit;
