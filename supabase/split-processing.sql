-- ============================================================
-- Quizify migration: split-processing
-- Run this AFTER schema.sql / storage.sql / exam-mode.sql in the
-- Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================

-- Cache the extracted PDF text so each processing step can re-use it
-- without re-downloading + re-parsing the file from storage.
alter table public.uploads
  add column if not exists notes_text text;
