-- Global admins may publish their own confessions immediately. Regular
-- authors can still only create pending submissions.
drop policy if exists "confessions: author insert" on public.confessions;
create policy "confessions: author insert" on public.confessions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      moderation_status = 'pending'
      or (moderation_status = 'approved' and public.is_global_admin(auth.uid()))
    )
  );

create or replace function public.admin_update_moderation_status(
  p_item_id uuid,
  p_item_type text,
  p_status text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_published_at timestamptz;
begin
  if not public.is_global_admin(auth.uid()) then
    raise exception 'Global admin access required.';
  end if;

  if p_item_type = 'confession' then
    if p_status is null or p_status not in ('approved', 'rejected') then
      raise exception 'Unsupported confession moderation status: %', p_status;
    end if;

    update public.confessions
    set moderation_status = p_status,
        published_at = case when p_status = 'approved' then now() else null end,
        reviewed_by = auth.uid()
    where id = p_item_id
    returning published_at into v_published_at;
  elsif p_item_type = 'post' then
    if p_status is null or p_status not in ('approved', 'rejected', 'flagged') then
      raise exception 'Unsupported post moderation status: %', p_status;
    end if;

    update public.posts
    set status = case p_status
      when 'approved' then 'active'
      when 'rejected' then 'removed'
      else 'flagged'
    end
    where id = p_item_id
    returning updated_at into v_published_at;
  else
    raise exception 'Unsupported moderation item type: %', p_item_type;
  end if;

  if not found then
    raise exception 'Moderation item not found.';
  end if;

  return v_published_at;
end;
$$;

revoke all on function public.admin_update_moderation_status(uuid, text, text) from public, anon;
grant execute on function public.admin_update_moderation_status(uuid, text, text) to authenticated;
