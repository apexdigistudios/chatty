-- Per-user block list used to filter content authored by blocked accounts.
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  constraint user_blocks_blocker_blocked_unique unique (blocker_id, blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user blocks: involved user read" on public.user_blocks;
create policy "user blocks: involved user read"
  on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));

drop policy if exists "user blocks: own create" on public.user_blocks;
create policy "user blocks: own create"
  on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists "user blocks: own delete" on public.user_blocks;
create policy "user blocks: own delete"
  on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on table public.user_blocks from anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant all on table public.user_blocks to service_role;
