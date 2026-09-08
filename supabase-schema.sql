-- Geeny Voice tables (run in the SAME Supabase project as Geeny Studio)
-- profiles + credit_transactions already exist from Studio — shared wallet.

-- Saved voice clones per user
create table if not exists public.user_voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  elevenlabs_voice_id text not null,
  name text not null default 'My voice',
  sample_url text,
  created_at timestamptz not null default now()
);

create index if not exists user_voices_user_id_idx on public.user_voices(user_id);

-- Voice generation jobs
create table if not exists public.voice_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_voice_id uuid references public.user_voices(id) on delete set null,
  title text,
  script text not null,
  status text not null default 'pending',
  audio_url text,
  chars_count int,
  credits_charged int default 0,
  credits_reserved int default 0,
  error_message text,
  provider_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_jobs_user_id_idx on public.voice_jobs(user_id);

-- RLS
alter table public.user_voices enable row level security;
alter table public.voice_jobs enable row level security;

create policy "Users read own voices" on public.user_voices
  for select using (auth.uid() = user_id);
create policy "Users insert own voices" on public.user_voices
  for insert with check (auth.uid() = user_id);
create policy "Users delete own voices" on public.user_voices
  for delete using (auth.uid() = user_id);

create policy "Users read own voice jobs" on public.voice_jobs
  for select using (auth.uid() = user_id);

-- Service role bypasses RLS for API routes
