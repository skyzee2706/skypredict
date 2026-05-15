# Sky Predict — Ritual Prediction Markets

Sky Predict is a decentralized prediction-market platform for crypto and sports markets on the Ritual network. It combines Solidity prediction markets, a SkyUSD betting token, a Next.js frontend, automated market operations, and a Supabase-backed PM2 indexer for portfolio and leaderboard data.

> **Status:** Experimental testnet software. Not audited. Do not use with real funds.

## Current Production Architecture

```text
.
├── contracts/
│   ├── contracts/
│   │   ├── MarketFactory.sol       # Deploys and tracks prediction markets
│   │   ├── PredictionMarket.sol    # Betting, resolution, and claim logic
│   │   ├── MarketRouter.sol        # Router-based trading entrypoint/events
│   │   ├── SkyUSDT.sol             # SkyUSD ERC-20 and faucet
│   │   └── MockV3Aggregator.sol    # Test oracle helper
│   ├── scripts/deploy.ts           # Fresh stack deployment
│   └── ritual_deployment.json      # Current deployment reference
├── frontend/
│   ├── src/app/                    # Next.js App Router UI/API routes
│   ├── src/hooks/                  # Market, portfolio, leaderboard hooks
│   ├── src/lib/indexer/            # File/Supabase indexer adapters
│   ├── src/lib/onchain/            # viem/wagmi reads and writes
│   ├── scripts/indexer-worker.cjs  # PM2 Supabase indexer worker
│   └── supabase_schema.sql         # Required DB tables/constraints
├── scripts/auto-market.ts          # Market creation/resolution scheduler
├── ecosystem.config.js             # PM2 market scheduler config
└── README.md
```

## Core Features

- Daily crypto prediction markets for BTC, ETH, SOL, XRP, DOGE, and BNB.
- Football markets with Home / Draw / Away outcomes.
- SkyUSD ERC-20 betting token with 6 decimals.
- Faucet and hidden owner admin treasury page.
- Router-aware betting flow for accurate indexed trading events.
- Database-first portfolio and leaderboard pages using Supabase.
- Automatic 60-second fallback to chain scanning if database reads fail.
- PM2-managed background indexer for leaderboard, portfolio, volume, and PNL.
- PM2-managed market scheduler for creation and resolution.

## PNL and Indexing Model

Leaderboard and portfolio stats are based on indexed on-chain activity.

```text
PNL = current_or_claimable_value - total_trading_volume
```

For resolved winning positions, the indexer mirrors `PredictionMarket.claim()`:

```text
grossPayout = userWinningBet * totalPool / winningPool
fee = grossPayout * 10%
claimablePayout = grossPayout - fee
PNL = claimablePayout - volume
```

Open markets are treated as neutral current value, so unrealized PNL does not incorrectly show a loss while the position is still active.

The indexer is designed to be idempotent:

- `user_activities` uses `(tx_hash, log_index)` as the primary key.
- `user_portfolios` uses `(user_address, market_address)` as the primary key.
- `leaderboard` uses `user_address` as the primary key.
- The worker loads existing activities before scanning, so PM2 restarts or overlapping scans do not double-count volume/trades.
- Router `BetRouted` logs are preferred; SkyUSD `Transfer` logs are fallback and deduped by transaction/market.

## Required Environment Variables

### Root `.env`

Used by Hardhat and the market scheduler.

```env
PRIVATE_KEY=your_deployer_private_key_without_0x
NETWORK_NAME=Ritual
CHAIN_ID=1979
RITUAL_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
RITUAL_EXPLORER_URL=https://explorer.ritualfoundation.org
FACTORY_ADDRESS=0xYourFactory
NEXT_PUBLIC_FACTORY_ADDRESS=0xYourFactory
SKYUSD_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_SKYUSD_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_ROUTER_ADDRESS=0xYourRouter
OWNER_ADDRESS=0xYourOwner
NEXT_PUBLIC_OWNER_ADDRESS=0xYourOwner
FOOTBALL_DATA_API_KEY=your_football_data_api_key
```

### `frontend/.env.local`

Used by the Next.js frontend and indexer worker.

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your_privy_client_id
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_FACTORY_ADDRESS=0xYourFactory
NEXT_PUBLIC_SKYUSD_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_TOKEN_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_ROUTER_ADDRESS=0xYourRouter
NEXT_PUBLIC_OWNER_ADDRESS=0xYourOwner
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

> Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code. It must only be used by server routes or the worker.

## Installation

```bash
npm install
cd frontend
npm install
```

## Contracts

Compile from root:

```bash
npm run compile
```

Or from `contracts/`:

```bash
cd contracts
npm run compile
```

Deploy from `contracts/`:

```bash
npx hardhat run scripts/deploy.ts --network ritual
```

After deployment, update:

- root `.env`
- `contracts/.env`
- `frontend/.env.local`

## Frontend

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

Production build:

```bash
cd frontend
npm run build
```

## Supabase Setup

Apply the schema in:

```text
frontend/supabase_schema.sql
```

Required tables:

- `indexer_state`
- `user_portfolios`
- `user_activities`
- `leaderboard`

The primary keys in that schema are required for duplicate prevention.

## Running the Indexer

From `frontend/`:

```bash
npm run indexer:once
```

Full historical backfill, resetting indexed tables first:

```bash
npm run indexer:backfill
```

PM2 worker:

```bash
pm2 start npm --name skypredict-indexer -- run indexer:worker
pm2 logs skypredict-indexer
```

Restart after env/code changes:

```bash
pm2 restart skypredict-indexer --update-env
```

## Running the Market Scheduler

From project root:

```bash
npm run auto-market
```

With PM2:

```bash
pm2 start ecosystem.config.js
pm2 logs sky-market-scheduler
pm2 restart ecosystem.config.js --update-env
```

## Important Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/markets` | Market list |
| `/markets/[id]` | Market detail and trading |
| `/portfolio` | Database-first user portfolio |
| `/leaderboard` | Database-first leaderboard |
| `/faucet` | SkyUSD faucet |
| `/admin` | Hidden owner treasury dashboard |

## Verification Commands

```bash
npm run compile
npm test
cd frontend
npx tsc --noEmit
npm run lint
node --check scripts/indexer-worker.cjs
```

## Deployment Checklist

- [ ] Root `.env` points to the current deployed contracts.
- [ ] `contracts/.env` matches root deployment addresses.
- [ ] `frontend/.env.local` matches current factory, router, and SkyUSD token.
- [ ] Supabase schema has been applied.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is present only server-side/worker-side.
- [ ] Contracts compile.
- [ ] Frontend typecheck/lint/build passes.
- [ ] PM2 market scheduler is running.
- [ ] PM2 indexer worker is running.
- [ ] Leaderboard and portfolio show indexed wallet stats.
- [ ] Faucet, approval, bet placement, and claim flows confirm by receipt.

## Security Notes

- Do not commit `.env`, `.env.local`, private keys, API keys, logs, or runtime caches.
- Rotate keys if they were ever committed historically.
- Use a dedicated deployer wallet and keep owner wallet access restricted.
- Hidden routes are not security boundaries; contract owner checks must enforce permissions.
- External price and sports APIs can fail or delay; monitor scheduler logs.
- This repository is experimental testnet software and has not received a formal third-party audit.

## License

MIT
