alter table public.profiles
  add column if not exists username_last_changed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from public.profiles
    group by lower(username)
    having count(*) > 1
  ) then
    raise exception 'Cannot create case-insensitive username uniqueness: duplicate usernames already exist.';
  end if;
end;
$$;

create unique index if not exists profiles_username_idx
  on public.profiles (lower(username));

create or replace function public.enforce_profile_username_change_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    if old.username_last_changed_at is not null
      and now() < old.username_last_changed_at + interval '7 days' then
      raise exception 'You can only change your username once every 7 days.';
    end if;

    new.username_last_changed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_username_change_rules on public.profiles;
create trigger profiles_enforce_username_change_rules
before update of username on public.profiles
for each row
execute function public.enforce_profile_username_change_rules();
