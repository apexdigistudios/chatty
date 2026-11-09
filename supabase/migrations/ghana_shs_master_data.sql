begin;

create extension if not exists pg_trgm with schema extensions;
set local search_path = public, extensions, pg_temp;

alter table public.schools
  add column if not exists code text,
  add column if not exists motto text,
  add column if not exists category text,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists normalized_name text;

create unique index if not exists schools_code_unique_idx
  on public.schools (code)
  where code is not null;

create index if not exists schools_normalized_name_trgm_idx
  on public.schools using gin (normalized_name gin_trgm_ops);

create index if not exists schools_aliases_gin_idx
  on public.schools using gin (aliases);

create or replace function public.normalize_school_name(input_name text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(input_name, '')),
          '[[:punct:]]+',
          ' ',
          'g'
        ),
        '\m(shs|senior[[:space:]]+high|college|school)\M',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.set_school_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_school_name(new.name);
  select coalesce(array_agg(distinct normalized_alias), '{}'::text[])
  into new.aliases
  from (
    select public.normalize_school_name(alias) as normalized_alias
    from unnest(coalesce(new.aliases, '{}'::text[])) as alias
  ) as normalized_aliases
  where normalized_alias <> '';
  return new;
end;
$$;

drop trigger if exists schools_set_normalized_name on public.schools;
create trigger schools_set_normalized_name
  before insert or update
  on public.schools
  for each row
  execute function public.set_school_normalized_name();

update public.schools
set normalized_name = public.normalize_school_name(name),
    aliases = coalesce(aliases, '{}'::text[]);

alter table public.schools
  alter column normalized_name set not null;

-- Widely used names for the existing Presbyterian Boys' SHS community.
update public.schools
set aliases = array(
  select distinct alias
  from unnest(
    coalesce(aliases, '{}'::text[]) ||
    array[
      'presec',
      'odade3',
      'presby boys',
      'presec legon',
      'presbyterian boys'
    ]::text[]
  ) as alias
  order by alias
)
where normalized_name like 'presbyterian boys%';

create or replace function public.search_schools_fuzzy(search_term text)
returns table (
  id uuid,
  name text,
  region text,
  school_type text,
  code text,
  motto text,
  category text,
  aliases text[],
  normalized_name text,
  similarity_score real
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with normalized_query as (
    select public.normalize_school_name(search_term) as value
  )
  select
    school.id,
    school.name,
    school.region,
    school.school_type,
    school.code,
    school.motto,
    school.category,
    school.aliases,
    school.normalized_name,
    greatest(
      similarity(school.normalized_name, normalized_query.value),
      coalesce(
        (
          select max(similarity(alias, normalized_query.value))
          from unnest(school.aliases) as alias
        ),
        0
      )
    )::real as similarity_score
  from public.schools as school
  cross join normalized_query
  where normalized_query.value <> ''
    and (
      similarity(school.normalized_name, normalized_query.value) > 0.4
      or normalized_query.value = any(school.aliases)
    )
  order by similarity_score desc, school.name asc, school.id asc;
$$;

revoke all on function public.search_schools_fuzzy(text) from public;
grant execute on function public.search_schools_fuzzy(text) to anon, authenticated;

commit;
