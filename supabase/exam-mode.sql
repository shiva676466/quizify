-- ============================================================
-- Quizify migration: summary style modes
-- Run this AFTER schema.sql and storage.sql in the Supabase SQL editor.
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.quizzes
  add column if not exists summary_mode text not null default 'general'
    check (summary_mode in ('general', 'exam'));
