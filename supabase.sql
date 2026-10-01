-- выполнить один раз в supabase: sql editor → new query → вставить → run

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS: каждый видит и меняет только свою строку
alter table public.app_state enable row level security;

drop policy if exists "own select" on public.app_state;
drop policy if exists "own insert" on public.app_state;
drop policy if exists "own update" on public.app_state;

create policy "own select" on public.app_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.app_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.app_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- анонимам — вообще ничего
revoke all on public.app_state from anon;

-- ограничение на размер, чтобы никто не забил базу мусором (5 мб с запасом)
alter table public.app_state drop constraint if exists data_size;
alter table public.app_state add constraint data_size check (pg_column_size(data) < 5000000);
