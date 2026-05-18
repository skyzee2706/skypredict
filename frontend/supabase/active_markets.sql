create table if not exists public.active_markets (
  market_address text primary key,
  title text not null,
  ticker text not null,
  category text not null,
  market_type text not null,
  identifier text not null,
  side_a_name text,
  draw_name text,
  side_b_name text,
  description text,
  strike_price double precision,
  deadline bigint not null default 0,
  betting_end_time bigint not null default 0,
  creation_date bigint,
  resolution_source text,
  resolution_rule text,
  liquidity double precision not null default 0,
  volume double precision not null default 0,
  state text not null default 'ACTIVE',
  resolved_outcome text,
  deadline_price double precision,
  price_symbol text,
  prob_yes double precision not null default 0.5,
  prob_draw double precision not null default 0,
  prob_no double precision not null default 0.5,
  percent_change double precision not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists active_markets_deadline_idx on public.active_markets(deadline);
create index if not exists active_markets_category_idx on public.active_markets(category);
create index if not exists active_markets_state_idx on public.active_markets(state);
