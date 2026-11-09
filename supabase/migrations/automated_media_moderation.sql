-- Apply after the posts and post_media schema/policy migrations.
create table if not exists public.automated_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  source text not null check (source in ('post_caption', 'post_media')),
  file_name text,
  media_type text check (media_type in ('image', 'video')),
  decision text not null check (decision in ('rejected')),
  flagged_categories jsonb not null default '{}'::jsonb,
  provider text not null,
  created_at timestamptz not null default now()
);

create index if not exists automated_moderation_audit_created_idx
  on public.automated_moderation_audit (created_at desc);
create index if not exists automated_moderation_audit_user_created_idx
  on public.automated_moderation_audit (user_id, created_at desc);

alter table public.automated_moderation_audit enable row level security;
revoke all on table public.automated_moderation_audit from public, anon, authenticated;
grant select on table public.automated_moderation_audit to authenticated;
grant all on table public.automated_moderation_audit to service_role;

drop policy if exists "automated moderation audit: global admin read"
  on public.automated_moderation_audit;
create policy "automated moderation audit: global admin read"
  on public.automated_moderation_audit
  for select to authenticated
  using (public.is_global_admin());

drop policy if exists "posts: own insert" on public.posts;
drop policy if exists "posts: group must match school" on public.posts;
drop policy if exists "post media: author create" on public.post_media;

revoke insert on table public.posts from public, anon, authenticated;
revoke insert on table public.post_media from public, anon, authenticated;
grant insert on table public.posts to service_role;
grant insert on table public.post_media to service_role;
