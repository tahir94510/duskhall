-- Optional only. The MVP does not need this table.
create table if not exists public.kabal_room_events (
  id bigserial primary key,
  room_id text not null,
  player_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kabal_room_events enable row level security;

create policy "Allow anon insert room events"
  on public.kabal_room_events
  for insert
  to anon
  with check (true);

create policy "Allow anon read recent room events"
  on public.kabal_room_events
  for select
  to anon
  using (created_at > now() - interval '24 hours');
