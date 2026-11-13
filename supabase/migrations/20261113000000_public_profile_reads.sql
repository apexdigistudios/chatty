drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "profiles: public read" on public.profiles;

create policy "Public profiles are viewable by everyone"
  on public.profiles
  for select
  using (true);

grant select on public.profiles to anon, authenticated;
