create or replace function public.get_my_confessions()
returns table (
  id uuid,
  school_id uuid,
  category text,
  content text,
  created_at timestamptz,
  published_at timestamptz,
  moderation_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.school_id,
    c.category,
    c.content,
    c.created_at,
    c.published_at,
    c.moderation_status
  from public.confessions c
  where c.author_id = auth.uid()
  order by c.created_at desc;
$$;

revoke all on function public.get_my_confessions() from public, anon;
grant execute on function public.get_my_confessions() to authenticated;

notify pgrst, 'reload schema';
