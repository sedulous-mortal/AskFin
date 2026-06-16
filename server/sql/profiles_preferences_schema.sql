-- Add preferences JSONB column to profiles table.
-- Run this in the Supabase SQL editor.

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- No additional ALTER TABLE needed for default_tab / default_subtab.
-- These are stored as keys inside the preferences JSONB column:
--   preferences->>'default_tab'    text  e.g. 'stats' | 'tips' | 'ref' | 'faq' | 'dashboard-overview' | 'settings'
--   preferences->>'default_subtab' text  e.g. 'quests' | 'research' | 'critters' … (only meaningful for 'tips' and 'ref')
-- Default value for new users: default_tab = 'stats', default_subtab = null
