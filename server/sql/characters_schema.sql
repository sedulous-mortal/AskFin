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
  add column if not exists farm_name               text,
  add column if not exists exp                     integer,
  add column if not exists player_species_id       integer,
  add column if not exists difficulty              integer,
  add column if not exists total_play_time_seconds float,
  add column if not exists player_pronouns         integer,
  add column if not exists save_file_version       integer,
  add column if not exists updated_at              timestamptz not null default now();

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
