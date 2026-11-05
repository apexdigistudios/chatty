-- Global admins may submit a confession without targeting a school.
alter table public.confessions
  alter column school_id drop not null;
