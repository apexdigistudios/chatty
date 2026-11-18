-- Existing confession rows are retained and initialized as approved; future
-- submissions use PENDING_REVIEW through the server-side RPC.
alter table public.confessions
  add column if not exists moderation_status text,
  add column if not exists ai_categories jsonb,
  add column if not exists ai_scores jsonb,
  add column if not exists ai_flags text[] not null default '{}',
  add column if not exists is_urgent_safeguarding boolean not null default false,
  add column if not exists report_count integer not null default 0;

alter table public.confessions
  drop constraint if exists confessions_moderation_status_check;

update public.confessions set moderation_status = 'APPROVED';

alter table public.confessions
  alter column moderation_status set default 'PENDING_REVIEW',
  alter column moderation_status set not null,
  drop constraint if exists confessions_report_count_check,
  add constraint confessions_moderation_status_check
    check (moderation_status in (
      'APPROVED',
      'PENDING_REVIEW',
      'REJECTED',
      'ESCALATED',
      'HIDDEN_UNDER_REVIEW'
    )),
  add constraint confessions_report_count_check check (report_count >= 0);

drop index if exists public.confessions_moderation_queue_idx;
create index confessions_moderation_queue_idx
  on public.confessions (moderation_status, created_at);
create index if not exists confessions_published_idx
  on public.confessions (published_at desc)
  where moderation_status = 'APPROVED';
create index if not exists confessions_author_created_idx
  on public.confessions (author_id, created_at desc);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in (
    'APPROVED',
    'REJECTED',
    'ESCALATED',
    'RESTORED',
    'USER_WARNED',
    'USER_RESTRICTED',
    'USER_SUSPENDED'
  )),
  decision_notes text,
  previous_status text,
  new_status text,
  created_at timestamptz not null default now()
);
create index if not exists moderation_logs_confession_created_idx
  on public.moderation_logs (confession_id, created_at desc);
create index if not exists moderation_logs_moderator_created_idx
  on public.moderation_logs (moderator_id, created_at desc);

create table if not exists public.confession_reports (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'Bullying',
    'Sexual content',
    'Personal information exposure',
    'Threats',
    'Hate speech',
    'False accusations',
    'Other inappropriate content'
  )),
  details text,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_at timestamptz not null default now(),
  constraint confession_reports_confession_reporter_unique unique (confession_id, reporter_id)
);
create index if not exists confession_reports_status_created_idx
  on public.confession_reports (status, created_at desc);

create or replace function public.increment_confession_report_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.confessions
  set report_count = report_count + 1
  where id = new.confession_id;
  return new;
end;
$$;
revoke all on function public.increment_confession_report_count() from public, anon, authenticated;
grant execute on function public.increment_confession_report_count() to service_role;
drop trigger if exists confession_reports_increment_count on public.confession_reports;
create trigger confession_reports_increment_count
  after insert on public.confession_reports
  for each row execute function public.increment_confession_report_count();

create table if not exists public.user_moderation_records (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  warning_count integer not null default 0 check (warning_count >= 0),
  strike_count integer not null default 0 check (strike_count >= 0),
  restriction_level text not null default 'NONE'
    check (restriction_level in ('NONE', 'WARNING', 'TEMP_RESTRICTED', 'SUSPENDED')),
  restricted_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.moderation_logs enable row level security;
alter table public.confession_reports enable row level security;
alter table public.user_moderation_records enable row level security;

create or replace function public.is_confession_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user_id is not null
    and (p_user_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
    and (
      exists (
        select 1
        from public.profiles p
        where p.id = p_user_id and p.is_admin is true
      )
      or public.is_global_admin(p_user_id)
    ),
    false
  );
$$;
revoke all on function public.is_confession_admin(uuid) from public, anon;
grant execute on function public.is_confession_admin(uuid) to authenticated, service_role;

drop policy if exists "moderation logs: global admins only" on public.moderation_logs;
create policy "moderation logs: global admins only"
  on public.moderation_logs for all to authenticated
  using (public.is_confession_admin(auth.uid()))
  with check (public.is_confession_admin(auth.uid()));
drop policy if exists "confession reports: global admins only" on public.confession_reports;
create policy "confession reports: global admins only"
  on public.confession_reports for all to authenticated
  using (public.is_confession_admin(auth.uid()))
  with check (public.is_confession_admin(auth.uid()));
drop policy if exists "user moderation records: global admins only" on public.user_moderation_records;
create policy "user moderation records: global admins only"
  on public.user_moderation_records for all to authenticated
  using (public.is_confession_admin(auth.uid()))
  with check (public.is_confession_admin(auth.uid()));

revoke all on public.moderation_logs, public.confession_reports, public.user_moderation_records
  from public, anon, authenticated;
grant select, insert, update on public.moderation_logs, public.confession_reports, public.user_moderation_records
  to authenticated;
grant all on public.moderation_logs, public.confession_reports, public.user_moderation_records
  to service_role;

-- Base-table access never exposes another student's author linkage. Public
-- reads use the explicit, approved-only projection below.
drop policy if exists "confessions: author or admin read" on public.confessions;
drop policy if exists "confessions: author insert" on public.confessions;
drop policy if exists "confessions: global admin update" on public.confessions;
drop policy if exists "confessions: author or admin delete" on public.confessions;
drop policy if exists "confessions: author pending delete" on public.confessions;
drop policy if exists "confessions: administrators read" on public.confessions;
drop policy if exists "confessions: administrators delete" on public.confessions;
create policy "confessions: administrators read"
  on public.confessions for select to authenticated
  using (public.is_confession_admin(auth.uid()));
create policy "confessions: administrators delete"
  on public.confessions for delete to authenticated
  using (public.is_confession_admin(auth.uid()));
create policy "confessions: author pending delete"
  on public.confessions for delete to authenticated
  using (author_id = auth.uid() and moderation_status = 'PENDING_REVIEW');
revoke all on public.confessions from public, anon, authenticated;
grant select, delete on public.confessions to authenticated;
grant all on public.confessions to service_role;

-- Return a submitter's own non-public moderation state without exposing the
-- underlying author_id column or granting base-table SELECT to students.
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
  select c.id, c.school_id, c.category, c.content, c.created_at, c.published_at, c.moderation_status
  from public.confessions c
  where c.author_id = auth.uid()
  order by c.created_at desc;
$$;
revoke all on function public.get_my_confessions() from public, anon;
grant execute on function public.get_my_confessions() to authenticated;

-- Public projection remains an explicit allowlist and never includes author_id.
create or replace view public.public_confessions as
  select
    c.id,
    c.school_id,
    c.category,
    c.content,
    c.created_at,
    c.published_at,
    case when not c.is_anonymous then s.username else null end as seed_username,
    case when not c.is_anonymous then s.full_name else null end as seed_full_name,
    case when not c.is_anonymous then s.avatar_url else null end as seed_avatar_url,
    (not c.is_anonymous and s.id is not null) as is_seed,
    coalesce((
      select array_agg(cm.media_url order by cm.sort_order)
      from public.confession_media cm where cm.confession_id = c.id
    ), array[]::text[]) as media_urls,
    coalesce((
      select array_agg(cm.media_type order by cm.sort_order)
      from public.confession_media cm where cm.confession_id = c.id
    ), array[]::text[]) as media_types,
    (
      select count(*)::bigint
      from public.confession_comments cc
      where cc.confession_id = c.id
    ) as comment_count,
    sch.name as school_name,
    sch.logo_url as school_crest_url
  from public.confessions c
  left join public.admin_seed_profiles s on s.id = c.seed_profile_id
  left join public.schools sch on sch.id = c.school_id
  where c.moderation_status = 'APPROVED';
grant select on public.public_confessions to anon, authenticated;

drop policy if exists "Confession media is visible with its confession" on public.confession_media;
create policy "Confession media is visible with its confession"
  on public.confession_media for select
  using (
    exists (
      select 1 from public.confessions c
      where c.id = confession_media.confession_id
        and (
          c.moderation_status = 'APPROVED'
          or c.author_id = auth.uid()
          or public.is_confession_admin(auth.uid())
        )
    )
  );

-- Serialize submissions per author so parallel requests cannot evade the
-- three-per-hour limit. Only the authenticated server route's service client
-- may invoke this function.
create or replace function public.submit_confession_for_review(
  p_author_id uuid,
  p_school_id uuid,
  p_category text,
  p_content text
)
returns table (
  id uuid,
  school_id uuid,
  category text,
  content text,
  created_at timestamptz,
  published_at timestamptz,
  moderation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.user_moderation_records%rowtype;
  v_recent_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server-side confession submission required.' using errcode = '42501';
  end if;
  if p_author_id is null or p_content is null
    or char_length(btrim(p_content)) not between 1 and 300
    or p_category not in ('Crush Confession', 'School Secret', 'Relationship Gist', 'Friendship Gist') then
    raise exception 'Invalid confession details.' using errcode = '22023';
  end if;
  if p_school_id is null then
    raise exception 'Choose your school before submitting a confession.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text, 0));
  insert into public.user_moderation_records (user_id)
  values (p_author_id)
  on conflict (user_id) do nothing;
  select * into v_record
  from public.user_moderation_records
  where user_id = p_author_id
  for update;

  if v_record.restriction_level = 'SUSPENDED'
    or (v_record.restriction_level = 'TEMP_RESTRICTED'
      and (v_record.restricted_until is null or v_record.restricted_until > pg_catalog.now())) then
    raise exception 'Your account is restricted from submitting confessions.' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_recent_count
  from public.confessions c
  where c.author_id = p_author_id
    and c.created_at >= pg_catalog.now() - interval '1 hour';
  if v_recent_count >= 3 then
    raise exception 'Confession rate limit reached. You can submit up to 3 confessions per hour.' using errcode = 'P0001';
  end if;

  return query
  insert into public.confessions as new_confession (
    author_id, school_id, category, content, moderation_status, published_at
  )
  values (
    p_author_id, p_school_id, p_category, btrim(p_content), 'PENDING_REVIEW', null
  )
  returning
    new_confession.id,
    new_confession.school_id,
    new_confession.category,
    new_confession.content,
    new_confession.created_at,
    new_confession.published_at,
    new_confession.moderation_status;
end;
$$;
revoke all on function public.submit_confession_for_review(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_confession_for_review(uuid, uuid, text, text) to service_role;

-- All moderator decisions pass through this audited function, not direct
-- client-side updates to the moderation fields.
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
  v_previous_status text;
  v_new_status text;
  v_action text;
  v_author_id uuid;
begin
  if not public.is_confession_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  if p_item_type = 'confession' then
    if lower(p_status) not in ('approved', 'rejected', 'escalated', 'restored', 'hidden_under_review') then
      raise exception 'Unsupported confession moderation status: %', p_status;
    end if;
    v_new_status := upper(case lower(p_status)
      when 'restored' then 'approved'
      when 'hidden_under_review' then 'hidden_under_review'
      else p_status
    end);
    v_action := case
        when lower(p_status) = 'restored' then 'RESTORED'
        when v_new_status = 'APPROVED' then 'APPROVED'
        when v_new_status = 'REJECTED' then 'REJECTED'
        else 'ESCALATED'
      end;

    select c.moderation_status, c.author_id into v_previous_status, v_author_id
    from public.confessions c where c.id = p_item_id for update;
    if not found then raise exception 'Moderation item not found.'; end if;

    update public.confessions
    set moderation_status = v_new_status,
        published_at = case when v_new_status = 'APPROVED' then coalesce(published_at, now()) else null end,
        reviewed_by = auth.uid()
    where id = p_item_id
    returning published_at into v_published_at;

    insert into public.moderation_logs (
      confession_id, moderator_id, action, previous_status, new_status
    ) values (
      p_item_id, auth.uid(), v_action, v_previous_status, v_new_status
    );

    if v_new_status = 'REJECTED' and v_author_id is not null then
      insert into public.user_moderation_records (user_id, strike_count, restriction_level)
      values (v_author_id, 1, 'WARNING')
      on conflict (user_id) do update
      set strike_count = public.user_moderation_records.strike_count + 1,
          restriction_level = case
            when public.user_moderation_records.restriction_level = 'NONE' then 'WARNING'
            else public.user_moderation_records.restriction_level
          end,
          updated_at = now();
    end if;
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

  if not found and p_item_type = 'post' then
    raise exception 'Moderation item not found.';
  end if;
  return v_published_at;
end;
$$;
revoke all on function public.admin_update_moderation_status(uuid, text, text) from public, anon;
grant execute on function public.admin_update_moderation_status(uuid, text, text) to authenticated;

create or replace function public.admin_moderate_confession(
  p_confession_id uuid,
  p_status text,
  p_decision_notes text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published_at timestamptz;
  v_previous_status text;
  v_author_id uuid;
  v_new_status text;
begin
  if not public.is_confession_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;
  if upper(p_status) not in ('APPROVED', 'REJECTED', 'ESCALATED', 'RESTORED', 'HIDDEN_UNDER_REVIEW') then
    raise exception 'Unsupported confession moderation status.';
  end if;
  v_new_status := case when upper(p_status) = 'RESTORED' then 'APPROVED' else upper(p_status) end;

  select c.moderation_status, c.author_id into v_previous_status, v_author_id
  from public.confessions c where c.id = p_confession_id for update;
  if not found then raise exception 'Confession not found.'; end if;

  update public.confessions
  set moderation_status = v_new_status,
      published_at = case when v_new_status = 'APPROVED' then coalesce(published_at, pg_catalog.now()) else null end,
      reviewed_by = auth.uid()
  where id = p_confession_id
  returning published_at into v_published_at;

  insert into public.moderation_logs (
    confession_id, moderator_id, action, decision_notes, previous_status, new_status
  ) values (
    p_confession_id, auth.uid(),
    case
      when upper(p_status) = 'RESTORED' then 'RESTORED'
      when v_new_status = 'APPROVED' then 'APPROVED'
      when v_new_status = 'REJECTED' then 'REJECTED'
      else 'ESCALATED'
    end,
    nullif(btrim(p_decision_notes), ''),
    v_previous_status,
    v_new_status
  );

  if v_new_status = 'REJECTED' and v_author_id is not null then
    insert into public.user_moderation_records (user_id, strike_count, restriction_level)
    values (v_author_id, 1, 'WARNING')
    on conflict (user_id) do update
    set strike_count = public.user_moderation_records.strike_count + 1,
        restriction_level = case
          when public.user_moderation_records.restriction_level = 'NONE' then 'WARNING'
          else public.user_moderation_records.restriction_level
        end,
        updated_at = pg_catalog.now();
  end if;

  return v_published_at;
end;
$$;
revoke all on function public.admin_moderate_confession(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_confession(uuid, text, text) to authenticated;
