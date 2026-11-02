-- Gist Spotlight, Paystack payments, automated moderation, and gist reports.
-- Additive migration: this file creates new objects and does not alter existing
-- application tables.

create table if not exists public.spotlight_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  paystack_reference varchar(100) not null unique,
  amount_pesewas bigint not null,
  currency varchar(10) not null default 'GHS',
  status varchar(30) not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.spotlight_promotions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_id uuid references public.spotlight_payments (id) on delete set null,
  package_type varchar(50) not null,
  target_school_ids uuid[],
  status varchar(30) not null default 'pending_payment'
    check (
      status in (
        'pending_payment',
        'pending_moderation',
        'active',
        'paused',
        'flagged',
        'expired',
        'rejected'
      )
    ),
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  promotion_id uuid not null references public.spotlight_promotions (id) on delete cascade,
  provider varchar(50) not null default 'openai-omni-moderation-latest',
  is_flagged boolean not null default false,
  flagged_categories jsonb,
  category_scores jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.gist_reports (
  id uuid primary key default gen_random_uuid(),
  gist_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason varchar(100) not null
    check (
      reason in (
        'bullying',
        'hate_speech',
        'violence',
        'sexual',
        'scam',
        'privacy',
        'spam',
        'other'
      )
    ),
  details text,
  is_serious_safety boolean not null default false,
  created_at timestamptz not null default now(),
  constraint gist_reports_gist_reporter_unique unique (gist_id, reporter_id)
);

create index if not exists spotlight_payments_user_created_idx
  on public.spotlight_payments (user_id, created_at desc);
create index if not exists spotlight_promotions_user_created_idx
  on public.spotlight_promotions (user_id, created_at desc);
create index if not exists spotlight_promotions_post_status_idx
  on public.spotlight_promotions (post_id, status);
create index if not exists spotlight_promotions_active_expiry_idx
  on public.spotlight_promotions (expires_at)
  where status = 'active';
create index if not exists moderation_logs_promotion_created_idx
  on public.moderation_logs (promotion_id, created_at desc);
create index if not exists gist_reports_gist_created_idx
  on public.gist_reports (gist_id, created_at desc);
create index if not exists gist_reports_serious_created_idx
  on public.gist_reports (created_at desc)
  where is_serious_safety;

alter table public.spotlight_payments enable row level security;
alter table public.spotlight_promotions enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.gist_reports enable row level security;

-- A private security-definer helper lets the promotion SELECT policy check
-- moderation results without exposing moderation log details to app users.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to anon, authenticated;

create or replace function private.is_public_spotlight(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.spotlight_promotions promotion
    join public.posts post on post.id = promotion.post_id
    where promotion.id = $1
      and promotion.status = 'active'
      and promotion.started_at <= pg_catalog.now()
      and promotion.expires_at > pg_catalog.now()
      and post.status = 'active'
      and not exists (
        select 1
        from public.moderation_logs moderation
        where moderation.promotion_id = promotion.id
          and moderation.is_flagged
      )
  );
$$;

revoke all on function private.is_public_spotlight(uuid) from public;
grant execute on function private.is_public_spotlight(uuid) to anon, authenticated;

drop policy if exists "spotlight payments: owner read" on public.spotlight_payments;
create policy "spotlight payments: owner read"
  on public.spotlight_payments
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "spotlight promotions: owner or public read" on public.spotlight_promotions;
create policy "spotlight promotions: owner or public read"
  on public.spotlight_promotions
  for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or private.is_public_spotlight(id)
  );

drop policy if exists "gist reports: reporter read" on public.gist_reports;
create policy "gist reports: reporter read"
  on public.gist_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "gist reports: authenticated submit" on public.gist_reports;
create policy "gist reports: authenticated submit"
  on public.gist_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- Payments and promotion state are written by trusted server-side code only.
-- Users may not create/update payment records or change promotion state.
revoke all on table public.spotlight_payments from anon, authenticated;
revoke all on table public.spotlight_promotions from anon, authenticated;
revoke all on table public.moderation_logs from anon, authenticated;
revoke all on table public.gist_reports from anon, authenticated;
grant select on table public.spotlight_payments to authenticated;
grant select on table public.spotlight_promotions to anon, authenticated;
grant select, insert on table public.gist_reports to authenticated;
grant all on table public.spotlight_payments to service_role;
grant all on table public.spotlight_promotions to service_role;
grant all on table public.moderation_logs to service_role;
grant all on table public.gist_reports to service_role;

create or replace function public.guard_spotlight_promotion_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or current_user = 'service_role' then
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

drop trigger if exists spotlight_promotions_guard_state on public.spotlight_promotions;
create trigger spotlight_promotions_guard_state
  before insert or update on public.spotlight_promotions
  for each row execute function public.guard_spotlight_promotion_state();

create or replace function public.set_gist_report_safety_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_serious_safety := new.reason in ('violence', 'privacy', 'sexual');
  return new;
end;
$$;

drop trigger if exists gist_reports_set_safety_flag on public.gist_reports;
create trigger gist_reports_set_safety_flag
  before insert or update of reason, is_serious_safety on public.gist_reports
  for each row execute function public.set_gist_report_safety_flag();
