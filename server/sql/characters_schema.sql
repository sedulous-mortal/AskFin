-- Characters table schema for AskFin
-- Run this in the Supabase SQL editor.
-- The ALTER TABLE block is safe to re-run; it skips columns that already exist.

create table if not exists public.characters (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.profiles(id) on delete cascade,
  character_name          text        not null,
  farm_name               text,
  exp                     integer,
  player_species_id       integer,
  difficulty              integer,
  total_play_time_seconds float,
  player_pronouns         integer,
  save_file_version       integer,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- If the table already existed without these columns, add them:
alter table public.characters
  add column if not exists farm_name                  text,
  add column if not exists exp                        integer,
  add column if not exists player_species_id          integer,
  add column if not exists difficulty                 integer,
  add column if not exists total_play_time_seconds    float,
  add column if not exists player_pronouns            integer,
  add column if not exists save_file_version          integer,
  add column if not exists updated_at                 timestamptz not null default now(),
  add column if not exists save_file_name             text,
  add column if not exists fish_discovered            integer[]   default '{}',
  add column if not exists critters_discovered        integer[]   default '{}',
  add column if not exists items_discovered           integer[]   default '{}',
  add column if not exists unlocked_crafting_recipes  integer[]   default '{}',
  add column if not exists unlocked_cooking_recipes   integer[]   default '{}',
  add column if not exists quest_data                 jsonb       default '[]'::jsonb,
  add column if not exists current_day                integer,
  add column if not exists current_season             integer,
  add column if not exists current_year               integer,
  add column if not exists donated_specimen_count     integer     default 0,
  add column if not exists tool_data                  jsonb       default '[]'::jsonb;

-- Unique save file per user (nulls excluded so rows without a name don't conflict).
create unique index if not exists characters_user_save_file_unique
  on public.characters (user_id, save_file_name)
  where save_file_name is not null;

-- Row-level security (server-side endpoints use the service role key and bypass
-- RLS automatically; these policies protect direct client-side queries).
alter table public.characters enable row level security;

do $$ begin
  create policy "Users can view own characters"
    on public.characters for select
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can insert own characters"
    on public.characters for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can update own characters"
    on public.characters for update
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users can delete own characters"
    on public.characters for delete
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
