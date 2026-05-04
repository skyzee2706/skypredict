# Sky Predict — Ritual Prediction Markets

Sky Predict is a decentralized prediction market for **crypto prices** and **football matches** on the Ritual network.
Users bet with **SkyUSD** and only pay normal gas when placing bets. The protocol takes a **10% fee only from winner payouts** when users claim.

## Features

- **Crypto markets** for BTC, ETH, SOL, XRP, DOGE, and BNB.
- **Sports markets** for selected major football fixtures and all UCL matches.
- **3-way football betting**: Home, Draw, Away.
- **Automated market deployment** through `scripts/auto-market.ts`.
- **Automated crypto resolution** using 10-exchange median pricing.
- **Automated sports resolution** from football-data.org final scores.
- **SkyUSD faucet** for testnet usage.
- **Leaderboard** with PNL and Volume tabs.
- **Privy + wagmi + viem** wallet integration.

## Tech Stack

- Solidity + Hardhat
- Next.js 16 + React 19
- TypeScript
- wagmi v2 + viem
- Privy
- PM2 scheduler
- football-data.org API
- CCXT for crypto market pricing

## Project Structure

```text
.
├── contracts/contracts/
│   ├── MarketFactory.sol        # Deploys and tracks prediction markets
│   ├── PredictionMarket.sol     # 2-way crypto and 3-way sports market logic
│   └── SkyUSDT.sol              # SkyUSD faucet token
├── frontend/
│   ├── src/app/                 # Next.js app routes
│   ├── src/hooks/               # Client hooks, including leaderboard
│   └── src/lib/onchain/         # Contract reads/writes and chain config
├── scripts/
│   ├── auto-market.ts           # Market creation/resolution scheduler
│   └── sports-markets.json      # Runtime sports cache, gitignored
├── ecosystem.config.js          # PM2 config
├── hardhat.config.ts            # Root Hardhat config
└── .env.example                 # Root env template
```

## Prerequisites

- Node.js 18+
- npm
- Git
- A Ritual wallet with native gas token
- Privy app credentials
- football-data.org API key
- PM2 for production scheduler usage:

```bash
npm install -g pm2
```

## Installation

### 1. Clone and install root dependencies

```bash
git clone https://github.com/skyzee2706/skypredict.git
cd skypredict
npm install
```

### 2. Configure root environment

```bash
cp .env.example .env
```

Fill `.env`:

```env
PRIVATE_KEY=your_deployer_private_key_without_0x
RITUAL_RPC_URL=https://rpc.ritualfoundation.org
RITUAL_EXPLORER_API_KEY=
RITUAL_EXPLORER_API_URL=https://explorer.ritualfoundation.org/api
FOOTBALL_DATA_API_KEY=your_football_data_api_key
FEE_WALLET=0xYourFeeWallet
```

> Never commit `.env` files. They are ignored by git.

### 3. Install frontend dependencies

```bash
cd frontend
npm install
cp .env.example .env.local
```

Fill `frontend/.env.local`:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your_privy_client_id
NEXT_PUBLIC_FACTORY_ADDRESS=0xYourMarketFactory
NEXT_PUBLIC_BET_FACTORY_ADDRESS=0xYourMarketFactory
NEXT_PUBLIC_SKYUSD_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_TOKEN_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_OWNER_ADDRESS=0xYourOwnerAddress
NEXT_PUBLIC_BRIDGE_SERVICE_URL=http://localhost:3000
```

### 4. Run frontend locally

From `frontend/`:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Contract Workflow

### Compile

From project root:

```bash
npm run compile
```

### Deploy to Ritual

```bash
npm run deploy:ritual
```

After deploy, copy the deployed addresses into `frontend/.env.local`.

### Export ABI if needed

```bash
npm run export-abi
```

## Auto-Market Scheduler

The scheduler handles both crypto and sports markets.

### Local run

From project root:

```bash
npm run auto-market
```

### Production run with PM2

```bash
pm2 start ecosystem.config.js
pm2 logs sky-market-scheduler
```

Restart after code/env changes:

```bash
pm2 restart ecosystem.config.js
```

## Sports Market Automation

The backend uses `GET https://api.football-data.org/v4/matches`.

Behavior:

- Discovery runs every **12 hours**.
- Fixtures are deployed up to **H-5 days** before kickoff.
- Betting closes exactly at **kickoff**.
- Resolution scan runs every **10 minutes**.
- Finished matches resolve using full-time score.
- Outcome mapping:
  - `0` = Home / SideA
  - `1` = Draw
  - `2` = Away / SideB

Runtime state is saved in:

```text
scripts/sports-markets.json
```

That file is intentionally gitignored because it is local runtime cache.

## Fee Model

| Action | Fee |
|---|---:|
| Place bet | No protocol fee, gas only |
| Claim winning payout | 10% protocol fee from payout |
| Losing bet | No claim |

The old native-token fee for placing bets has been removed from the current market flow.

## Leaderboard

The leaderboard has two tabs:

- **Leaderboard PNL**: claimed payout minus total betting volume.
- **Leaderboard Volume**: total SkyUSD bet volume.

It shows Top 1-10. If the connected wallet is outside Top 10, the page shows the user's exact rank separately.

Because Ritual RPC limits `eth_getLogs` to 100,000 blocks per request, logs are scanned in chunks.

## Verification Commands

Frontend type check:

```bash
cd frontend
npx tsc --noEmit
```

Frontend lint:

```bash
cd frontend
npm run lint
```

Contract tests:

```bash
npm test
```

> Current note: `npm test` may fail on Windows if Hardhat treats files under `contracts/node_modules` as local sources. Use the root workspace dependencies, remove nested contract `node_modules`, or run with a clean install before final CI.

## Deployment Checklist

- [ ] Root `.env` is filled.
- [ ] `frontend/.env.local` has current contract addresses.
- [ ] Contracts compile.
- [ ] Frontend type check passes.
- [ ] Frontend runs locally.
- [ ] PM2 scheduler starts successfully.
- [ ] A test market can be created.
- [ ] A test bet can be placed after SkyUSD approval.
- [ ] Claim works on a resolved winner.
- [ ] Leaderboard loads without RPC range errors.

## Security Notes

- Do not commit private keys, API keys, `.env`, logs, or runtime caches.
- Use a dedicated deployer wallet.
- This project is experimental testnet software and has not been professionally audited.

## License

MIT
