alter table public.posts
  add column if not exists hashtags text[] not null default '{}';

create or replace function public.extract_post_hashtags(p_content text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct lower(captures[1]) order by lower(captures[1])), array[]::text[])
  from regexp_matches(coalesce(p_content, ''), '#([A-Za-z0-9_]{1,50})', 'g') as matches(captures);
$$;

create or replace function public.sync_post_hashtags()
returns trigger
language plpgsql
as $$
begin
  new.hashtags := public.extract_post_hashtags(new.content);
  return new;
end;
$$;

drop trigger if exists posts_sync_hashtags on public.posts;
create trigger posts_sync_hashtags
  before insert or update of content on public.posts
  for each row execute function public.sync_post_hashtags();

update public.posts
set hashtags = public.extract_post_hashtags(content)
where hashtags is distinct from public.extract_post_hashtags(content);

create index if not exists posts_hashtags_gin_idx
  on public.posts using gin (hashtags);
