alter table public.posts
  add column if not exists video_thumbnail_url text;

alter table public.post_media
  add column if not exists video_thumbnail_url text;
