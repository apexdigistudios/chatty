alter table public.posts
  drop constraint if exists posts_content_check;

alter table public.posts
  add constraint posts_content_check
  check (
    char_length(content) between 1 and 300
    or (char_length(content) = 0 and media_url is not null)
  );
