alter table public.profiles
  drop constraint if exists profiles_username_check;

alter table public.profiles
  drop constraint if exists profiles_username_length_check;

alter table public.profiles
  add constraint profiles_username_length_check
  check (char_length(username) between 3 and 24);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  base_username    text;
  candidate        text;
  requested_school uuid;
  pending_school_name text;
  pending_school_region text;
  pending_school_type text;
  attempt          int := 0;
begin
  base_username := nullif(new.raw_user_meta_data->>'username', '');
  if base_username is null or char_length(base_username) < 3 or char_length(base_username) > 24 then
    base_username := lower(regexp_replace(
      coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'student'),
      '[^A-Za-z0-9_]', '', 'g'));
    if char_length(base_username) < 3 then
      base_username := 'student' || substr(replace(new.id::text, '-', ''), 1, 6);
    end if;
  end if;
  base_username := left(base_username, 24);
  candidate := base_username;

  begin
    requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  exception when others then
    requested_school := null;
  end;
  if requested_school is not null
     and not exists (select 1 from public.schools where id = requested_school) then
    requested_school := null;
  end if;

  pending_school_name := nullif(btrim(new.raw_user_meta_data->>'school_name'), '');
  pending_school_region := coalesce(nullif(btrim(new.raw_user_meta_data->>'school_region'), ''), 'Not specified');
  pending_school_type := lower(coalesce(nullif(new.raw_user_meta_data->>'school_type', ''), 'public'));
  if pending_school_type not in ('public', 'private', 'mission', 'technical') then
    pending_school_type := 'public';
  end if;

  loop
    begin
      insert into public.profiles (id, username, school_id, avatar_url, bio)
      values (
        new.id, candidate, requested_school,
        coalesce(
          nullif(new.raw_user_meta_data->>'avatar_url', ''),
          'https://api.dicebear.com/9.x/notionists/svg?seed=' || candidate || '&backgroundColor=ede9fe'
        ),
        '');
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      candidate := left(base_username, 16) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      if attempt > 5 then raise; end if;
    end;
  end loop;

  if pending_school_name is not null then
    if char_length(pending_school_name) < 3 or char_length(pending_school_name) > 80 then
      raise exception 'School names must be between 3 and 80 characters.';
    end if;

    begin
      insert into public.schools (name, region, school_type, creator_id)
      values (pending_school_name, pending_school_region, pending_school_type, new.id)
      returning id into requested_school;
    exception when unique_violation then
      select id into requested_school
      from public.schools
      where lower(btrim(name)) = lower(btrim(pending_school_name))
      order by created_at, id
      limit 1;
    end;

    update public.profiles
    set school_id = requested_school
    where id = new.id;
  end if;

  return new;
end;
$$;
