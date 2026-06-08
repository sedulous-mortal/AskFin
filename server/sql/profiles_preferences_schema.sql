-- Add preferences JSONB column to profiles table.
-- Run this in the Supabase SQL editor.

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
