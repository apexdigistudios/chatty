-- Community reporting thresholds and the platform safety queue.
-- Run after spotlight_and_reports.sql.

alter table public.posts
  add column if not exists is_hidden boolean not null default false;

create index if not exists posts_safety_hidden_idx
  on public.posts (created_at desc)
  where is_hidden;

create table if not exists public.safety_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists safety_notifications_recipient_created_idx
  on public.safety_notifications (recipient_id, created_at desc);

alter table public.safety_notifications enable row level security;
revoke all on table public.safety_notifications from anon, authenticated;
grant select on table public.safety_notifications to authenticated;
grant all on table public.safety_notifications to service_role;

drop policy if exists "safety notifications: recipient read" on public.safety_notifications;
create policy "safety notifications: recipient read"
  on public.safety_notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create or replace function public.handle_gist_report_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_count bigint;
  has_serious_report boolean;
  post_author uuid;
  was_hidden boolean;
begin
  select count(distinct report.reporter_id)
    into report_count
    from public.gist_reports report
    where report.gist_id = new.gist_id
      and report.created_at >= pg_catalog.now() - interval '72 hours';

  select exists (
    select 1
      from public.gist_reports report
      where report.gist_id = new.gist_id
        and report.is_serious_safety
  )
  into has_serious_report;

  if report_count < 3 and not has_serious_report then
    return new;
  end if;

  select post.user_id, post.is_hidden
    into post_author, was_hidden
    from public.posts post
    where post.id = new.gist_id
    for update;

  if not found then
    return new;
  end if;

  update public.posts
    set is_hidden = true
    where id = new.gist_id;

  update public.spotlight_promotions
    set status = 'paused'
    where post_id = new.gist_id
      and status = 'active';

  if not was_hidden then
    insert into public.safety_notifications (recipient_id, post_id, title, body)
    values (
      post_author,
      new.gist_id,
      'Gist temporarily paused',
      'Your gist has been temporarily paused for review after community reports.'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_gist_report_threshold() from public, anon, authenticated;

create or replace function public.guard_spotlight_promotion_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'service_role'
    or current_user = 'service_role'
    or current_user = 'postgres'
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

drop trigger if exists gist_reports_handle_threshold on public.gist_reports;
create trigger gist_reports_handle_threshold
  after insert on public.gist_reports
  for each row execute function public.handle_gist_report_threshold();

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_roles role_row
      where role_row.user_id = (select auth.uid())
        and role_row.role = 'global_admin'
  );
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

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
        and not post.is_hidden
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

drop policy if exists "safety: hide flagged posts from anon" on public.posts;
create policy "safety: hide flagged posts from anon"
  on public.posts as restrictive
  for select to anon
  using (not is_hidden);

drop policy if exists "safety: hide flagged posts from authenticated" on public.posts;
create policy "safety: hide flagged posts from authenticated"
  on public.posts as restrictive
  for select to authenticated
  using (
    not is_hidden
    or user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

create or replace function public.safety_dismiss_gist(p_actor_id uuid, p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.admin_roles role_row
      where role_row.user_id = p_actor_id
        and role_row.role = 'global_admin'
  ) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  delete from public.gist_reports where gist_id = p_post_id;
  update public.posts
    set is_hidden = false
    where id = p_post_id
      and status = 'active';
  update public.spotlight_promotions promotion
    set status = 'active'
    where promotion.post_id = p_post_id
      and promotion.status = 'paused'
      and promotion.expires_at > pg_catalog.now()
      and exists (
        select 1
          from public.posts post
          where post.id = promotion.post_id
            and post.status = 'active'
            and not post.is_hidden
      )
      and exists (
        select 1
          from public.spotlight_payments payment
          where payment.id = promotion.payment_id
            and payment.status = 'success'
      );
end;
$$;

create or replace function public.safety_remove_gist(p_actor_id uuid, p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.admin_roles role_row
      where role_row.user_id = p_actor_id
        and role_row.role = 'global_admin'
  ) then
    raise exception 'Platform administrator access is required.'
      using errcode = '42501';
  end if;

  update public.posts
    set status = 'removed', is_hidden = true
    where id = p_post_id;
  update public.spotlight_promotions
    set status = 'rejected'
    where post_id = p_post_id
      and status not in ('expired', 'rejected');
end;
$$;

revoke all on function public.safety_dismiss_gist(uuid, uuid) from public, anon, authenticated;
revoke all on function public.safety_remove_gist(uuid, uuid) from public, anon, authenticated;
grant execute on function public.safety_dismiss_gist(uuid, uuid) to service_role;
grant execute on function public.safety_remove_gist(uuid, uuid) to service_role;

drop policy if exists "safety: global admin read reports" on public.gist_reports;
create policy "safety: global admin read reports"
  on public.gist_reports
  for select to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists "safety: global admin read posts" on public.posts;
create policy "safety: global admin read posts"
  on public.posts
  for select to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists "safety: global admin read promotions" on public.spotlight_promotions;
create policy "safety: global admin read promotions"
  on public.spotlight_promotions
  for select to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists "safety: global admin read moderation logs" on public.moderation_logs;
create policy "safety: global admin read moderation logs"
  on public.moderation_logs
  for select to authenticated
  using ((select private.is_platform_admin()));

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'safety_notifications'
    )
  then
    execute 'alter publication supabase_realtime add table public.safety_notifications';
  end if;
end;
$$;
