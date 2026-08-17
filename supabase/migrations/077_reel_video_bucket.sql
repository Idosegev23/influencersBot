-- Storage bucket for banner reel videos.
--
-- These cannot live in `post-media`: that bucket is restricted to image MIME
-- types and a 10MB ceiling, which is exactly the guard rail that keeps a
-- routine scan from dumping video into it. A reel mp4 is a different kind of
-- object — hand-picked, a handful per account, tens of megabytes — so it gets
-- its own bucket with its own limits rather than loosening the image one.
--
-- Public read: the banner plays these to anonymous visitors, same as post
-- images. Writes go through the service role (scripts/persist-reel-videos.ts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reel-video',
  'reel-video',
  true,
  52428800,                                  -- 50MB; a 60s vertical reel is ~10-20MB
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
