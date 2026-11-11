create table if not exists public.school_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  media_url text not null,
  thumbnail_url text,
  media_type text not null check (media_type in ('image', 'video')),
  created_at timestamptz not null default current_timestamp,
  expires_at timestamptz not null default (current_timestamp + interval '24 hours')
);

create index if not exists school_highlights_school_expiry_idx
  on public.school_highlights (school_id, expires_at);

alter table public.school_highlights enable row level security;

drop policy if exists "Anyone can view active school highlights" on public.school_highlights;
create policy "Anyone can view active school highlights"
  on public.school_highlights
  for select
  to anon, authenticated
  using (expires_at > current_timestamp);

revoke all on public.school_highlights from public, anon, authenticated;
grant select on public.school_highlights to anon, authenticated;

create or replace function public.create_school_highlight(
  p_school_id uuid,
  p_media_url text,
  p_thumbnail_url text,
  p_media_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_school_id uuid;
  highlight_id uuid;
begin
  if caller_id is null then
    raise exception 'Sign in to share a highlight.';
  end if;

  if p_media_type not in ('image', 'video')
    or p_media_url is null
    or length(p_media_url) > 2048
    or (p_thumbnail_url is not null and length(p_thumbnail_url) > 2048)
  then
    raise exception 'The highlight media is invalid.';
  end if;

  select profile.school_id
  into caller_school_id
  from public.profiles as profile
  where profile.id = caller_id;

  if caller_school_id is distinct from p_school_id then
    raise exception 'Join this school before sharing a highlight.';
  end if;

  insert into public.school_highlights (
    user_id,
    school_id,
    media_url,
    thumbnail_url,
    media_type,
    created_at,
    expires_at
  )
  values (
    caller_id,
    p_school_id,
    p_media_url,
    p_thumbnail_url,
    p_media_type,
    current_timestamp,
    current_timestamp + interval '24 hours'
  )
  on conflict (user_id) do update
    set school_id = excluded.school_id,
        media_url = excluded.media_url,
        thumbnail_url = excluded.thumbnail_url,
        media_type = excluded.media_type,
        created_at = current_timestamp,
        expires_at = current_timestamp + interval '24 hours'
    where public.school_highlights.expires_at <= current_timestamp
  returning id into highlight_id;

  if highlight_id is null then
    raise exception 'You already have an active highlight.';
  end if;

  return highlight_id;
end;
$$;

revoke all on function public.create_school_highlight(uuid, text, text, text) from public, anon;
grant execute on function public.create_school_highlight(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
