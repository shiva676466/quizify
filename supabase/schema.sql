-- ============================================================
-- Quizify Supabase schema
-- Run this in Supabase SQL editor (one-shot, idempotent-ish).
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles : 1-to-1 with auth.users
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- uploads : a single uploaded PDF
-- ============================================================
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  size_bytes integer not null default 0,
  text_length integer not null default 0,
  status text not null default 'processing', -- processing | ready | failed
  error text,
  created_at timestamptz not null default now()
);

create index if not exists uploads_user_id_idx on public.uploads(user_id);
create index if not exists uploads_created_at_idx on public.uploads(created_at desc);

-- ============================================================
-- quizzes : generated summary + MCQs for one upload
-- ============================================================
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null default '',
  mcqs jsonb not null default '[]'::jsonb, -- [{question, options[4], answer_index, explanation}]
  created_at timestamptz not null default now()
);

create index if not exists quizzes_upload_id_idx on public.quizzes(upload_id);
create index if not exists quizzes_user_id_idx on public.quizzes(user_id);

-- ============================================================
-- flashcards : Q/A pairs for one upload
-- ============================================================
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text not null,
  created_at timestamptz not null default now()
);

create index if not exists flashcards_upload_id_idx on public.flashcards(upload_id);
create index if not exists flashcards_user_id_idx on public.flashcards(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.uploads     enable row level security;
alter table public.quizzes     enable row level security;
alter table public.flashcards  enable row level security;

-- profiles policies
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);

-- uploads policies
drop policy if exists "uploads owner select" on public.uploads;
create policy "uploads owner select" on public.uploads
  for select using (auth.uid() = user_id);

drop policy if exists "uploads owner insert" on public.uploads;
create policy "uploads owner insert" on public.uploads
  for insert with check (auth.uid() = user_id);

drop policy if exists "uploads owner update" on public.uploads;
create policy "uploads owner update" on public.uploads
  for update using (auth.uid() = user_id);

drop policy if exists "uploads owner delete" on public.uploads;
create policy "uploads owner delete" on public.uploads
  for delete using (auth.uid() = user_id);

-- quizzes policies
drop policy if exists "quizzes owner all" on public.quizzes;
create policy "quizzes owner all" on public.quizzes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- flashcards policies
drop policy if exists "flashcards owner all" on public.flashcards;
create policy "flashcards owner all" on public.flashcards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
