create table if not exists public.notification_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

create index if not exists notification_reads_user_read_at_idx
  on public.notification_reads (user_id, read_at desc);

alter table public.notification_reads enable row level security;
revoke all on table public.notification_reads from anon, authenticated;
grant select, insert, update on table public.notification_reads to authenticated;

drop policy if exists "notification reads: users manage own" on public.notification_reads;
create policy "notification reads: users manage own"
  on public.notification_reads
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
