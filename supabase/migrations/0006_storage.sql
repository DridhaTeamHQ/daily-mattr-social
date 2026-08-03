-- ============================================================================
-- 0006 — Storage buckets
-- ============================================================================

-- Screenshots are evidence containing other people's Instagram activity and
-- sometimes a student's own notification panel. The bucket is private; the app
-- hands out short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  false,
  10485760,  -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reel thumbnails shown on campaign cards. Public — they're our own marketing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  true,
  5242880,  -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── Screenshot access ──────────────────────────────────────────────────────
-- Object keys are `<ambassador_id>/<task_id>/<uuid>.<ext>`, so the first path
-- segment is the owner.

create policy "screenshots: owner reads own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screenshots: admin reads all"
  on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and public.is_admin());

-- Uploads are performed server-side with the service-role key after the file
-- has been validated and hashed. There is deliberately no INSERT policy for
-- `authenticated`: a direct client upload would let a student put a file in the
-- bucket that no submission row ever points at, and skip every check.

create policy "campaign-media: admin writes"
  on storage.objects for all to authenticated
  using (bucket_id = 'campaign-media' and public.is_admin())
  with check (bucket_id = 'campaign-media' and public.is_admin());
