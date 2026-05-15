create table if not exists indexer_state (
  id text primary key,
  last_processed_block numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists user_portfolios (
  user_address text not null,
  market_address text not null,
  side_a_amount numeric not null default 0,
  draw_amount numeric not null default 0,
  side_b_amount numeric not null default 0,
  volume numeric not null default 0,
  payout numeric not null default 0,
  pnl numeric not null default 0,
  claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_address, market_address)
);

alter table user_portfolios
  add column if not exists side_a_amount numeric not null default 0,
  add column if not exists draw_amount numeric not null default 0,
  add column if not exists side_b_amount numeric not null default 0,
  add column if not exists volume numeric not null default 0,
  add column if not exists payout numeric not null default 0,
  add column if not exists pnl numeric not null default 0,
  add column if not exists claimed boolean not null default false;

create index if not exists idx_user_portfolios_user
on user_portfolios (user_address);

create table if not exists user_activities (
  tx_hash text not null,
  log_index integer not null,
  user_address text not null,
  market_address text not null,
  type text not null,
  outcome integer,
  amount numeric not null default 0,
  block_number numeric not null,
  timestamp bigint not null,
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

create index if not exists idx_user_activities_user_block
on user_activities (user_address, block_number desc);

create table if not exists leaderboard (
  user_address text primary key,
  volume numeric not null default 0,
  payout numeric not null default 0,
  pnl numeric not null default 0,
  side_a_bets integer not null default 0,
  draw_bets integer not null default 0,
  side_b_bets integer not null default 0,
  total_bets integer not null default 0,
  volume_rank integer not null default 0,
  pnl_rank integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_leaderboard_volume_rank
on leaderboard (volume_rank);

create index if not exists idx_leaderboard_pnl_rank
on leaderboard (pnl_rank);

insert into indexer_state (id, last_processed_block)
values ('main', 0)
on conflict (id) do nothing;
