-- Apply the result of a server-side moderation check to a submission that was
-- first inserted as private PENDING_REVIEW.
create or replace function public.finalize_confession_moderation(
  p_confession_id uuid,
  p_moderation_status text,
  p_ai_categories jsonb,
  p_ai_scores jsonb,
  p_ai_flags text[],
  p_is_urgent_safeguarding boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server-side moderation finalization required.' using errcode = '42501';
  end if;
  if p_moderation_status not in ('APPROVED', 'PENDING_REVIEW', 'REJECTED') then
    raise exception 'Unsupported automated moderation status.' using errcode = '22023';
  end if;

  update public.confessions
  set moderation_status = p_moderation_status,
      ai_categories = p_ai_categories,
      ai_scores = p_ai_scores,
      ai_flags = coalesce(p_ai_flags, array[]::text[]),
      is_urgent_safeguarding = coalesce(p_is_urgent_safeguarding, false),
      published_at = case
        when p_moderation_status = 'APPROVED' then pg_catalog.now()
        else null
      end
  where id = p_confession_id
    and moderation_status = 'PENDING_REVIEW';

  if not found then
    raise exception 'Private confession submission could not be finalized.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.finalize_confession_moderation(uuid, text, jsonb, jsonb, text[], boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_confession_moderation(uuid, text, jsonb, jsonb, text[], boolean)
  to service_role;
