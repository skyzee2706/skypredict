# Sky Predict — Ritual Prediction Markets

Sky Predict is a decentralized prediction-market platform for daily crypto price markets and selected football fixtures on the Ritual network. The platform combines on-chain settlement, SkyUSD-denominated betting, automated market operations, and a premium web interface built for testnet usage.

Users interact with markets through the Next.js frontend, claim SkyUSD through a controlled faucet, approve SkyUSD spending, place predictions, and claim payouts after resolution. Backend automation is handled by `scripts/auto-market.ts`, which creates markets and resolves them using external data sources.

> **Status:** Experimental testnet software. Not audited. Do not use with real funds.

## Core Features

- **Daily crypto prediction markets** for BTC, ETH, SOL, XRP, DOGE, and BNB.
- **Football sports markets** for selected major domestic fixtures and UCL-style fixtures.
- **Binary crypto outcomes:** YES / NO.
- **3-way sports outcomes:** Home / Draw / Away.
- **SkyUSD ERC-20 betting token** with 6 decimals.
- **Paid SkyUSD faucet** with a native Ritual claim fee and claim limits.
- **Owner-only faucet treasury withdrawal** through a hidden `/admin` dashboard.
- **Automated market creation and resolution** through `scripts/auto-market.ts`.
- **Crypto resolution** using median pricing across multiple exchanges via CCXT.
- **Sports resolution** using football-data.org final match scores.
- **Receipt-aware wallet transactions** so UI success states only appear after on-chain confirmation.
- **Realtime balance refreshes** after faucet claims, approvals, bets, and claims.
- **Portfolio history pagination** and scrollable trade history.
- **Leaderboard page** prepared for professional ranking/indexer display.
- **Privy + wagmi + viem** wallet integration.

## Current Architecture

```text
.
├── contracts/
│   ├── contracts/
│   │   ├── MarketFactory.sol       # Owner factory for deploying market clones
│   │   ├── PredictionMarket.sol    # Market logic for crypto and sports outcomes
│   │   ├── SkyUSDT.sol             # SkyUSD token, faucet, and faucet treasury
│   │   ├── MockV3Aggregator.sol    # Test oracle helper
│   │   └── IPriceOracle.sol        # Oracle interface
│   ├── scripts/
│   │   └── deploy.ts               # Fresh stack deployment script
│   └── ritual_deployment.json      # Latest deployment output
├── frontend/
│   ├── src/app/                    # Next.js App Router pages
│   │   ├── admin/                  # Hidden admin treasury page
│   │   ├── faucet/                 # SkyUSD faucet UI
│   │   ├── leaderboard/            # Leaderboard placeholder/indexer UI
│   │   ├── markets/                # Market listing/detail routes
│   │   └── portfolio/              # User positions and history
│   ├── src/app/components/         # Shared UI components
│   ├── src/hooks/                  # Frontend hooks
│   └── src/lib/onchain/            # Contract read/write helpers
├── scripts/
│   ├── auto-market.ts              # Production market scheduler
│   ├── sports-markets.json         # Runtime sports cache, gitignored
│   └── force-resolve.ts            # Manual resolution helper
├── ecosystem.config.js             # PM2 scheduler config
├── hardhat.config.ts               # Root Hardhat config
├── package.json                    # Root contract/backend scripts
└── README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity `^0.8.20`, Hardhat, OpenZeppelin |
| Token | SkyUSD ERC-20, 6 decimals |
| Market deployment | EIP-1167 clone pattern via OpenZeppelin `Clones` |
| Frontend | Next.js 16, React 19, TypeScript |
| Wallet | Privy, wagmi v2, viem |
| Crypto pricing | CCXT median exchange pricing |
| Sports data | football-data.org API |
| Scheduler | TypeScript script managed by PM2 |
| Network | Ritual testnet |

## Smart Contract Overview

### `SkyUSDT.sol`

SkyUSD is the platform betting token.

Current behavior:

- Token name: `Sky USD`
- Symbol: `SkyUSD`
- Decimals: `6`
- Initial owner mint: `1,000,000 SkyUSD`
- Faucet amount: `1,000 SkyUSD` per successful claim
- Faucet claim fee: `0.001` native Ritual token
- Faucet limit: `2 claims / 24 hours / recipient`
- Owner can mint additional SkyUSD with `ownerMint()`
- Owner can withdraw accumulated faucet fees with `withdrawFees()`
- Frontend admin page reads `faucetFeeBalance()`

> The public faucet UI does not display the faucet fee text by design.

### `MarketFactory.sol`

The factory deploys and tracks prediction markets.

Key behavior:

- Owner-only market creation.
- Deploys markets as lightweight EIP-1167 clones.
- Tracks all created market addresses in `markets`.
- Supports default crypto markets through `createMarket()`.
- Supports named outcome markets through `createMarketWithOutcomes()`.
- Allows owner to update oracle/token/implementation addresses.

### `PredictionMarket.sol`

Market contract used by both crypto and sports markets.

Key behavior:

- Bets are denominated in SkyUSD.
- Users must approve SkyUSD before betting.
- Betting is blocked after `bettingEndTime`.
- Resolution is allowed after `endTime`.
- Crypto markets resolve by settlement price against strike price.
- Sports markets resolve by explicit outcome.
- Winning users can claim proportional payout from total pool.
- A `10%` protocol fee is taken from winner payouts at claim time.
- Losers have no claimable payout.

## Market Lifecycle

### Crypto Markets

1. `auto-market.ts` checks active markets from the current factory.
2. If no active daily market exists for a ticker, it creates a new daily market.
3. The strike price is based on live median exchange price.
4. Betting closes **3 hours before settlement** for daily crypto markets.
5. At/after settlement, the scheduler resolves expired markets using historical median pricing.
6. Users with the winning side can claim payouts.

### Sports Markets

1. `auto-market.ts` discovers upcoming eligible fixtures from football-data.org.
2. Eligible fixtures are created up to 5 days before kickoff.
3. Betting closes at kickoff.
4. The scheduler checks final match status after kickoff.
5. Finished matches resolve as:
   - `0` = Home / SideA
   - `1` = Draw
   - `2` = Away / SideB
6. Resolved fixture state is removed from `scripts/sports-markets.json`.

## Backend Automation

The canonical backend scheduler is:

```text
scripts/auto-market.ts
```

It is responsible for:

- Creating daily crypto markets.
- Resolving expired crypto markets.
- Discovering eligible football fixtures.
- Creating sports markets.
- Resolving sports markets after full-time scores are available.
- Maintaining runtime sports cache in `scripts/sports-markets.json`.

### PM2 Process

`ecosystem.config.js` runs the scheduler as:

```js
script: "node"
args: "-r ts-node/register/transpile-only scripts/auto-market.ts"
env_file: ".env"
```

Use `--update-env` whenever `.env` changes.

```bash
pm2 restart ecosystem.config.js --update-env
```

## Environment Variables

### Root `.env`

Used by Hardhat deployment and backend scheduler.

```env
PRIVATE_KEY=your_deployer_private_key_without_0x
NETWORK_NAME=Ritual
CHAIN_ID=1979
RITUAL_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
RITUAL_EXPLORER_URL=https://explorer.ritualfoundation.org
RITUAL_EXPLORER_API_URL=https://explorer.ritualfoundation.org/api
SEISMIC_RPC_URL=https://rpc.ritualfoundation.org
BASE_SEPOLIA_RPC_URL=https://rpc.ritualfoundation.org
DEPLOYER_ADDRESS=0xYourDeployer
OWNER_ADDRESS=0xYourOwner
FACTORY_ADDRESS=0xYourFactory
NEXT_PUBLIC_FACTORY_ADDRESS=0xYourFactory
USDL_ADDRESS=0xYourSkyUSD
SKYUSD_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_USDL_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_SKYUSD_ADDRESS=0xYourSkyUSD
BTC_ORACLE_ADDRESS=0xYourBtcOracle
ORACLE_ADDRESS=0xYourBtcOracle
ETH_ORACLE_ADDRESS=0xYourEthOracle
FOOTBALL_DATA_API_KEY=your_football_data_api_key
```

### `frontend/.env.local`

Used by the Next.js frontend.

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your_privy_client_id
NEXT_PUBLIC_BET_FACTORY_ADDRESS=0xYourFactory
NEXT_PUBLIC_FACTORY_ADDRESS=0xYourFactory
NEXT_PUBLIC_TOKEN_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_USDL_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_SKYUSD_ADDRESS=0xYourSkyUSD
NEXT_PUBLIC_OWNER_ADDRESS=0xYourOwner
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_SEISMIC_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_FIXED_RITUAL_FEE=0
NEXT_PUBLIC_BRIDGE_SERVICE_URL=http://localhost:3001
FOOTBALL_DATA_API_KEY=your_football_data_api_key
```

> Never commit `.env`, `.env.local`, private keys, API keys, or runtime cache files.

## Installation

### Root Dependencies

```bash
npm install
```

### Frontend Dependencies

```bash
cd frontend
npm install
```

## Contract Workflow

### Compile

From the project root:

```bash
npm run compile
```

Or from the contracts folder:

```bash
npx hardhat compile
```

### Deploy Fresh Stack to Ritual

From `contracts/`:

```bash
npx hardhat run scripts/deploy.ts --network ritual
```

The deploy script prints the fresh addresses for:

- `SkyUSDT / SkyUSD`
- `BTC/USD Oracle`
- `ETH/USD Oracle`
- `MarketFactory`

After deploying, update all address references in:

- `.env`
- `contracts/.env`
- `frontend/.env.local`

### Important Reset Note

A full reset requires:

1. Deploying a fresh SkyUSD token.
2. Deploying fresh oracle helpers.
3. Deploying a fresh MarketFactory.
4. Updating all env files.
5. Restarting the frontend and PM2 scheduler.
6. Running `auto-market.ts` or restarting PM2 so new markets are created from the new factory.

Old markets remain on-chain but are no longer part of the current app stack once the factory address changes.

## Frontend Workflow

### Development

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

### Production Build

```bash
cd frontend
npm run build
```

### Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/markets` | Active markets |
| `/portfolio` | User positions and trade history |
| `/faucet` | SkyUSD faucet |
| `/leaderboard` | Leaderboard/indexer page |
| `/admin` | Hidden owner-only treasury dashboard |

## Running the Scheduler

### Local One-Process Run

```bash
npm run auto-market
```

or:

```bash
npx tsx scripts/auto-market.ts
```

### Production With PM2

```bash
pm2 start ecosystem.config.js
pm2 logs sky-market-scheduler
```

Restart after code or env changes:

```bash
pm2 restart ecosystem.config.js --update-env
```

Stop:

```bash
pm2 stop sky-market-scheduler
```

## Fee Model

| Action | Fee |
|---|---:|
| Faucet claim | `0.001` native Ritual token |
| Place bet | No protocol fee, gas only |
| Claim winning payout | `10%` protocol fee from payout |
| Losing bet | No claimable payout |
| Admin faucet fee withdrawal | Gas only, owner-only |

Faucet fees accumulate inside the SkyUSD contract and can be withdrawn by the owner through `/admin`.

## Admin Dashboard

The admin dashboard is intentionally hidden and is not linked from the landing page.

```text
/admin
```

Behavior:

- Requires wallet connection.
- Only the configured owner/deployer wallet can withdraw faucet fees.
- Reads treasury balance from the SkyUSD contract.
- Calls `withdrawFees()` through receipt-aware transaction handling.

Owner address is configured via:

```env
NEXT_PUBLIC_OWNER_ADDRESS=0xYourOwner
```

## Transaction UX

Frontend write helpers wait for on-chain receipts before showing success states.

Covered flows:

- SkyUSD faucet claim.
- SkyUSD approval.
- Market bet placement.
- Reward claim.
- Faucet fee withdrawal.

After confirmed transactions, frontend components dispatch balance refresh events so the UI updates without a manual browser refresh.

## Leaderboard

The leaderboard route is prepared for professional ranking display. It is intended to support:

- Trader ranking.
- Win rate.
- Volume.
- Realized PNL.
- Connected-wallet rank when outside the top list.

RPC log scanning must be chunked because Ritual RPC can enforce `eth_getLogs` block-range limits.

## Verification Commands

### Contracts

```bash
npm run compile
npm test
```

### Frontend

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

> If the machine runs out of disk during compile/build, clear unused caches or free disk space first. `ENOSPC` means the process could not write files because storage is full.

## Deployment Checklist

- [ ] Root `.env` has the current deployer and contract addresses.
- [ ] `contracts/.env` matches the latest deployed stack.
- [ ] `frontend/.env.local` points to the same factory and SkyUSD token.
- [ ] Contracts compile successfully.
- [ ] Frontend builds successfully.
- [ ] PM2 scheduler starts successfully.
- [ ] `auto-market.ts` creates daily crypto markets from the current factory.
- [ ] Sports fixtures are created and tracked in `scripts/sports-markets.json`.
- [ ] Faucet claim succeeds after confirmation.
- [ ] SkyUSD balance updates without browser refresh.
- [ ] Approval succeeds before bet placement.
- [ ] Bet placement succeeds on an active market.
- [ ] Claims work for winning positions after resolution.
- [ ] `/admin` is accessible manually and withdraw is owner-only.

## Troubleshooting

### Approval or Bet Fails

Check:

- `NEXT_PUBLIC_TOKEN_ADDRESS` matches the current SkyUSD token.
- `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_BET_FACTORY_ADDRESS` match the current factory.
- The selected market was created by the current factory.
- User has enough SkyUSD.
- User approved the current market contract, not an old market.
- Betting deadline has not passed.

### Faucet Claim Fails

Check:

- User has enough native Ritual token for gas and faucet claim value.
- Claim recipient has not exceeded 2 claims in the current 24-hour window.
- Frontend ABI marks `faucet()` as payable.
- Frontend is using the fresh SkyUSD address.

### PM2 Uses Old Addresses

Restart with env reload:

```bash
pm2 restart ecosystem.config.js --update-env
```

Then inspect logs:

```bash
pm2 logs sky-market-scheduler
```

### Markets Not Updating

Check:

- PM2 process is running.
- `FACTORY_ADDRESS` points to the latest factory.
- Deployer wallet has enough Ritual gas.
- `sports-markets.json` is not stale after a factory reset.
- `auto-market.ts` is the active backend scheduler.

### ENOSPC During Compile or Build

`ENOSPC` means no disk space is available. Free storage, remove temporary build artifacts, or clear package-manager caches before retrying.

## Security Notes

- Do not commit private keys, API keys, `.env`, `.env.local`, logs, or runtime caches.
- Use a dedicated deployer wallet.
- Keep owner wallet access restricted.
- The `/admin` route is hidden but still protected by wallet ownership checks.
- This project is experimental testnet software and has not been professionally audited.
- External data sources can fail, delay, or return incomplete values; the scheduler includes retry behavior but cannot guarantee source availability.

## License

MIT
