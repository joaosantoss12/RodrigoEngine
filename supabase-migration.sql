-- RODRIGOTIPS ENGINE — run once in the Supabase SQL editor for this
-- project's own Supabase project (kept separate from El Pedrito's).

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  telegram_username text,
  telegram_name text not null,
  paid boolean not null default false,
  plan_type text not null default 'lifetime', -- 'lifetime' | 'monthly'
  invite_link text,
  stripe_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  customer_email text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Safe to re-run against an existing table created before plan_type/subscription
-- columns existed.
alter table public.subscribers add column if not exists plan_type text not null default 'lifetime';
alter table public.subscribers add column if not exists stripe_customer_id text;
alter table public.subscribers add column if not exists stripe_subscription_id text;
alter table public.subscribers add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscribers add column if not exists current_period_end timestamptz;

create index if not exists subscribers_telegram_user_paid_idx
  on public.subscribers (telegram_user_id, paid);

create index if not exists subscribers_stripe_subscription_idx
  on public.subscribers (stripe_subscription_id);

-- RLS: this table holds Telegram identity + payment/invite state, so it must
-- only ever be reachable through the service_role key (supabaseAdmin in
-- api/_lib/supabaseAdmin.js), never through the public anon key.
-- Enabling RLS with no policies denies all anon/authenticated access;
-- service_role bypasses RLS entirely.
alter table public.subscribers enable row level security;
