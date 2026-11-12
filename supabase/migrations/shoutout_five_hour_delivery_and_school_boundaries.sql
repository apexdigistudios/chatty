-- Deliver shoutouts after five hours and keep school moderation campus-scoped.

create or replace function public.is_school_moderator(target_school uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    uid is not null
    and target_school is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = uid
        and p.school_id = target_school
    )
    and (
      exists (
        select 1
        from public.schools s
        where s.id = target_school
          and s.creator_id = uid
      )
      or exists (
        select 1
        from public.admin_roles ar
        where ar.user_id = uid
          and ar.role = 'school_moderator'
          and ar.school_id = target_school
      )
    ),
    false
  );
$$;

create or replace function public.claim_school(target_school uuid)
returns public.schools
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.schools;
begin
  if auth.uid() is null then
    raise exception 'Sign in to claim a community.';
  end if;

  if not public.is_global_admin(auth.uid()) and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.school_id = target_school
  ) then
    raise exception 'You can only claim your assigned school.';
  end if;

  update public.schools
  set creator_id = auth.uid()
  where id = target_school
    and creator_id is null
  returning * into claimed;

  if claimed.id is null then
    raise exception 'This community already has a moderator.';
  end if;

  insert into public.admin_roles (user_id, role, school_id)
  values (auth.uid(), 'school_moderator', claimed.id)
  on conflict do nothing;
  return claimed;
end;
$$;

create or replace function public.release_due_shoutouts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  update public.shoutouts
  set status = 'delivered',
      delivered_at = coalesce(delivered_at, created_at + interval '5 hours')
  where status in ('in_transit', 'arrived')
    and created_at <= now() - interval '5 hours';

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

revoke all on function public.release_due_shoutouts() from public, anon;
grant execute on function public.release_due_shoutouts() to authenticated;

create or replace function public.enforce_shoutout_delivery_window()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Shoutout dispatch time cannot be changed.';
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'delivered'
      or old.status not in ('in_transit', 'arrived')
      or old.created_at > now() - interval '5 hours' then
      raise exception 'This letter is still in transit.';
    end if;
    new.delivered_at := coalesce(new.delivered_at, old.created_at + interval '5 hours');
  end if;

  if new.opened_at is distinct from old.opened_at
    and new.opened_at is not null
    and (
      new.status <> 'delivered'
      or old.created_at > now() - interval '5 hours'
    ) then
    raise exception 'This letter is still in transit.';
  end if;

  return new;
end;
$$;

drop trigger if exists shoutouts_delivery_window on public.shoutouts;
create trigger shoutouts_delivery_window
before update on public.shoutouts
for each row execute function public.enforce_shoutout_delivery_window();

drop policy if exists "shoutouts: participant read" on public.shoutouts;
create policy "shoutouts: participant read" on public.shoutouts
  for select to authenticated
  using (
    sender_id = auth.uid()
    or (
      status = 'delivered'
      and created_at <= now() - interval '5 hours'
      and (
        recipient_user_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.school_id = recipient_school_id
            and recipient_class = coalesce(p.class_form, '')
            and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
        )
      )
    )
  );
