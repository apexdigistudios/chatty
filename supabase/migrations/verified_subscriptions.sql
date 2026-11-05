alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_title text,
  add column if not exists verified_expires_at timestamptz,
  add column if not exists is_admin boolean not null default false,
  add column if not exists role text;

do $$
begin
  if to_regclass('public.admin_roles') is not null then
    execute $query$
      update public.profiles profile
      set is_admin = true
      where exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = profile.id
          and admin_role.role::text in ('admin', 'global_admin')
      )
    $query$;
  end if;
end
$$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  paystack_reference varchar(100) not null,
  amount numeric(10, 2) not null,
  currency varchar(10) not null default 'GHS',
  status varchar(30) not null default 'pending',
  expires_at timestamptz,
  title text,
  created_at timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists user_id uuid references public.profiles (id) on delete cascade,
  add column if not exists paystack_reference varchar(100),
  add column if not exists amount numeric(10, 2),
  add column if not exists currency varchar(10) default 'GHS',
  add column if not exists status varchar(30) default 'pending',
  add column if not exists expires_at timestamptz,
  add column if not exists title text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists subscriptions_paystack_reference_uidx
  on public.subscriptions (paystack_reference);
create index if not exists subscriptions_user_created_idx
  on public.subscriptions (user_id, created_at desc);

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions: owner read" on public.subscriptions;
create policy "subscriptions: owner read"
  on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
revoke update (is_verified, verified_title, verified_expires_at, is_admin, role)
  on public.profiles from anon, authenticated;
grant update (is_verified, verified_title, verified_expires_at, is_admin, role)
  on public.profiles to service_role;

create or replace function public.guard_profile_verification_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      if new.is_verified or new.is_admin or new.verified_title is not null
        or new.verified_expires_at is not null or new.role is not null then
        raise exception 'Verification and admin fields cannot be set by users.';
      end if;
    elsif new.is_verified is distinct from old.is_verified
      or new.is_admin is distinct from old.is_admin
      or new.verified_title is distinct from old.verified_title
      or new.verified_expires_at is distinct from old.verified_expires_at
      or new.role is distinct from old.role then
      raise exception 'Verification and admin fields cannot be changed by users.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_verification_fields on public.profiles;
create trigger profiles_guard_verification_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_verification_fields();

create or replace function public.activate_verification_subscription(
  p_user_id uuid,
  p_reference text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.subscriptions%rowtype;
  verification_expiry timestamptz;
begin
  select *
    into subscription_row
    from public.subscriptions
    where user_id = p_user_id
      and paystack_reference = p_reference
    for update;

  if not found then
    raise exception 'Verification payment was not found.';
  end if;

  if subscription_row.amount <> 50
    or subscription_row.currency <> 'GHS' then
    raise exception 'Verification payment amount is invalid.';
  end if;

  if subscription_row.status = 'active' then
    return subscription_row.expires_at;
  end if;

  if subscription_row.status <> 'pending' then
    raise exception 'Verification payment is not pending.';
  end if;

  verification_expiry := pg_catalog.now() + interval '60 days';

  update public.subscriptions
    set status = 'active',
        expires_at = verification_expiry
    where id = subscription_row.id;

  update public.profiles
    set is_verified = true,
        verified_title = nullif(pg_catalog.btrim(subscription_row.title), ''),
        verified_expires_at = verification_expiry
    where id = p_user_id;

  if not found then
    raise exception 'Verification profile was not found.';
  end if;

  return verification_expiry;
end;
$$;

revoke all on function public.activate_verification_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_verification_subscription(uuid, text) to service_role;
