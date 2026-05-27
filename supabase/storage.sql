-- ============================================================
-- Quizify Storage migration
-- Run this AFTER schema.sql in the Supabase SQL editor.
-- It is idempotent so re-running it is safe.
-- ============================================================

-- 1. Add storage_path to uploads so we know where the PDF lives.
alter table public.uploads
  add column if not exists storage_path text;

-- 2. Create the 'pdfs' bucket (private, 10MB, PDF only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 10485760, ARRAY['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. RLS policies on storage.objects:
--    Files are stored under  {auth.uid()}/{uuid}.pdf  — the first folder
--    segment is the owner's user id.

drop policy if exists "pdfs owner upload" on storage.objects;
create policy "pdfs owner upload" on storage.objects
  for insert
  with check (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "pdfs owner read" on storage.objects;
create policy "pdfs owner read" on storage.objects
  for select
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "pdfs owner update" on storage.objects;
create policy "pdfs owner update" on storage.objects
  for update
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "pdfs owner delete" on storage.objects;
create policy "pdfs owner delete" on storage.objects
  for delete
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
