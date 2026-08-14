-- RODRIGOTIPS ENGINE — run once in the Supabase SQL editor for this
-- project's own Supabase project (kept separate from El Pedrito's).

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  telegram_username text,
  telegram_name text not null,
  paid boolean not null default false,
  invite_link text,
  stripe_session_id text unique,
  customer_email text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists subscribers_telegram_user_paid_idx
  on public.subscribers (telegram_user_id, paid);

-- RLS: this table holds Telegram identity + payment/invite state, so it must
-- only ever be reachable through the service_role key (supabaseAdmin in
-- api/_lib/supabaseAdmin.js), never through the public anon key.
-- Enabling RLS with no policies denies all anon/authenticated access;
-- service_role bypasses RLS entirely.
alter table public.subscribers enable row level security;
