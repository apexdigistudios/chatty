-- ============================================================================
--  Gist me · Step 12 Migration (Real-Time Notifications)
--  Additive & idempotent. Run after migration-step10.sql.
--
--  The notification centre reads likes / comments / shoutouts / posts directly
--  and listens for INSERTs over Supabase Realtime. `likes` was the only one of
--  those tables missing from the realtime publication.
-- ============================================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.likes;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.posts;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.shoutouts;
  exception when duplicate_object then null; end;
end $$;

-- Realtime delivers only rows the caller may SELECT, so the existing RLS
-- policies already scope each student's notification stream:
--   likes        → public read, filtered client-side to posts they authored
--   comments     → readable on visible posts, filtered to their own posts
--   shoutouts    → participant read (sender, linked recipient, or exact
--                   school + official name + class match)
--   posts        → active posts only, filtered to their school
