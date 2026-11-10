alter table public.posts
  add column if not exists is_promoted boolean not null default false,
  add column if not exists promoted_until timestamptz,
  add column if not exists promotion_status text not null default 'expired'
    check (promotion_status in ('active', 'expired'));

alter table public.spotlight_promotions
  add column if not exists duration_hours integer not null default 24
    check (duration_hours between 1 and 168);

create or replace function public.guard_spotlight_promotion_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status = 'expired'
    and old.expires_at <= current_timestamp
    and new.payment_id is not distinct from old.payment_id
    and new.started_at is not distinct from old.started_at
    and new.expires_at is not distinct from old.expires_at
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.payment_id is not null
      or new.status is distinct from 'pending_payment'
      or new.started_at is not null
      or new.expires_at is not null
    then
      raise exception 'Spotlight payment and activation state is managed by trusted server-side code.'
        using errcode = '42501';
    end if;
  elsif new.payment_id is distinct from old.payment_id
    or new.status is distinct from old.status
    or new.started_at is distinct from old.started_at
    or new.expires_at is distinct from old.expires_at
  then
    raise exception 'Spotlight payment and activation state is managed by trusted server-side code.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

update public.spotlight_promotions
set duration_hours = case package_type
  when '2_hours' then 2
  when '1_day' then 24
  when '2_days' then 48
  when '7_days' then 168
  else 24
end;

update public.spotlight_promotions
set status = 'expired'
where status = 'active'
  and expires_at <= current_timestamp;

with current_campaigns as (
  select distinct on (post_id) post_id, expires_at
  from public.spotlight_promotions
  where status = 'active'
    and started_at <= current_timestamp
    and expires_at > current_timestamp
  order by post_id, expires_at desc
)
update public.posts post
set is_promoted = true,
    promoted_until = campaign.expires_at,
    promotion_status = 'active'
from current_campaigns campaign
where post.id = campaign.post_id;

create index if not exists posts_active_promotions_idx
  on public.posts (promoted_until)
  where is_promoted and promotion_status = 'active';

create or replace function public.guard_post_promotion_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_promoted
      or new.promoted_until is not null
      or new.promotion_status is distinct from 'expired'
    then
      raise exception 'Post promotion state is managed by trusted server-side code.'
        using errcode = '42501';
    end if;
  elsif old.is_promoted
    and old.promoted_until <= current_timestamp
    and not new.is_promoted
    and new.promotion_status = 'expired'
    and new.promoted_until is not distinct from old.promoted_until
  then
    return new;
  elsif new.is_promoted is distinct from old.is_promoted
    or new.promoted_until is distinct from old.promoted_until
    or new.promotion_status is distinct from old.promotion_status
  then
    raise exception 'Post promotion state is managed by trusted server-side code.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_guard_promotion_metadata on public.posts;
create trigger posts_guard_promotion_metadata
  before insert or update on public.posts
  for each row execute function public.guard_post_promotion_metadata();

create or replace function public.activate_spotlight_promotion(p_promotion_id uuid)
returns table(started_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.spotlight_promotions%rowtype;
  activation_time timestamptz := current_timestamp;
  expiration_time timestamptz;
begin
  if auth.role() is distinct from 'service_role'
    and current_user is distinct from 'service_role'
  then
    raise exception 'Only trusted server-side code can activate a promotion.'
      using errcode = '42501';
  end if;

  select * into campaign
  from public.spotlight_promotions
  where id = p_promotion_id
  for update;
  if not found or campaign.status <> 'pending_moderation' then
    raise exception 'Promotion is not awaiting activation.';
  end if;

  expiration_time := activation_time + pg_catalog.make_interval(hours => campaign.duration_hours);

  update public.posts
  set is_promoted = true,
      promoted_until = expiration_time,
      promotion_status = 'active'
  where id = campaign.post_id
    and status = 'active';
  if not found then
    raise exception 'Only active posts can be promoted.';
  end if;

  update public.spotlight_promotions
  set status = 'active',
      started_at = activation_time,
      expires_at = expiration_time
  where id = campaign.id;

  return query select activation_time, expiration_time;
end;
$$;

revoke all on function public.activate_spotlight_promotion(uuid) from public, anon, authenticated;
grant execute on function public.activate_spotlight_promotion(uuid) to service_role;

create or replace function public.expire_promoted_campaigns()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.spotlight_promotions
  set status = 'expired'
  where status = 'active'
    and expires_at <= current_timestamp;

  update public.posts
  set is_promoted = false,
      promotion_status = 'expired'
  where is_promoted
    and promotion_status = 'active'
    and promoted_until <= current_timestamp;
end;
$$;

revoke all on function public.expire_promoted_campaigns() from public;
grant execute on function public.expire_promoted_campaigns() to anon, authenticated;
