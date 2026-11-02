-- ============================================================================
--  Let's Gist · Step 10 Migration
--  Video posts, profile identity extensions, and the digital Shoutout postal system.
--  Additive & idempotent. Run after migration-step9.sql in the Supabase SQL Editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ───────────────────────────── Video post metadata ──────────────────────────
alter table public.posts
  add column if not exists media_type text check (media_type in ('image', 'video')),
  add column if not exists video_duration_seconds integer;

comment on column public.posts.media_type is 'image or video; NULL for legacy image-only gists.';

-- ───────────────────── Optional profile identity (settings only) ─────────────
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists class_form text;

comment on column public.profiles.full_name is 'Optional official name used for open postal shoutouts. Not collected during onboarding.';
comment on column public.profiles.class_form is 'Optional class/form, e.g. Form 2 Science 1.';

-- ───────────────────────── Digital inter-school shoutouts ───────────────────
create table if not exists public.shoutouts (
  id                  uuid primary key default gen_random_uuid(),
  sender_id           uuid not null references public.profiles (id) on delete cascade,
  sender_name         text not null,
  sender_school_id    uuid references public.schools (id) on delete set null,
  recipient_user_id   uuid references public.profiles (id) on delete set null,
  recipient_school_id uuid not null references public.schools (id) on delete cascade,
  recipient_name      text not null check (char_length(recipient_name) between 2 and 80),
  recipient_class     text not null default '',
  message             text not null check (char_length(message) between 1 and 500),
  envelope_theme      text not null default 'school_crest',
  stamp               text not null default 'priority',
  status              text not null default 'in_transit'
                      check (status in ('in_transit', 'arrived', 'delivered')),
  created_at          timestamptz not null default now(),
  arrived_at          timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz
);

create index if not exists shoutouts_sender_created_idx on public.shoutouts (sender_id, created_at desc);
create index if not exists shoutouts_recipient_created_idx on public.shoutouts (recipient_user_id, created_at desc);
create index if not exists shoutouts_recipient_lookup_idx on public.shoutouts (recipient_school_id, recipient_name, recipient_class);
create index if not exists shoutouts_status_idx on public.shoutouts (status, created_at desc);

alter table public.shoutouts enable row level security;

-- Participants can read their own sent mail. Recipients can read mail addressed
-- to their account OR to their exact school + official name + class (open postal lookup).
drop policy if exists "shoutouts: participant read" on public.shoutouts;
create policy "shoutouts: participant read" on public.shoutouts
  for select to authenticated
  using (
    sender_id = auth.uid()
    or recipient_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = recipient_school_id
        and recipient_class = coalesce(p.class_form, '')
        and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
    )
  );

-- Any signed-in student can send mail to any student, no follow required.
drop policy if exists "shoutouts: authenticated send" on public.shoutouts;
create policy "shoutouts: authenticated send" on public.shoutouts
  for insert to authenticated
  with check (sender_id = auth.uid() and status = 'in_transit');

-- Delivery progress can be updated by the sender, recipient, or global admin.
drop policy if exists "shoutouts: participant delivery update" on public.shoutouts;
create policy "shoutouts: participant delivery update" on public.shoutouts
  for update to authenticated
  using (
    sender_id = auth.uid()
    or recipient_user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = recipient_school_id
        and recipient_class = coalesce(p.class_form, '')
        and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
    )
  )
  with check (
    sender_id = auth.uid()
    or recipient_user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.school_id = recipient_school_id
        and recipient_class = coalesce(p.class_form, '')
        and lower(recipient_name) = lower(coalesce(p.full_name, p.username))
    )
  );

-- ───────────────────────── Realtime (optional inbox live updates) ────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.shoutouts;
  exception when duplicate_object then null; end;
end $$;
