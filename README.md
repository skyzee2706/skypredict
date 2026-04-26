# Sky Predict — Multi-Asset Decentralized Prediction Market

> A Polymarket-inspired on-chain prediction market on **Seismic Testnet**.  
> Built with Solidity, Next.js 16, Privy, wagmi v2, viem, and CCXT (10-CEX median price oracle).

[![Live Demo](https://img.shields.io/badge/Live%20Demo-skypredict.app-brightgreen)](https://skypredict.app)
[![Seismic Testnet](https://img.shields.io/badge/Network-Seismic%20Testnet-blueviolet)](https://seismic-testnet.socialscan.io)

---

## 🚀 What is Sky Predict?

Sky Predict lets users bet on whether **crypto asset prices will be above or below a target price** at a specific time. Markets run on a fully automated schedule — no manual intervention needed.

- **Supported Assets** — BTC, ETH, SOL, XRP, DOGE, BNB
- **Hourly Markets** — Betting closes 10 minutes before end time; bot resolves at `endTime`
- **Daily Markets** — Settled at midnight UTC; bot resolves at exactly 00:00 UTC

Markets are created, managed, and resolved entirely on-chain by an automated PM2 bot. Resolution uses a **median price aggregated from 10 CEXes** fetched at the exact `endTime`, submitted directly via `resolveWithCustomPrice()`.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **Multi-Asset Markets** | BTC, ETH, SOL, XRP, DOGE, BNB — all created and resolved automatically |
| **10-CEX Median Oracle** | Strike price & resolution price both sourced from median of 10 CEXes (Binance, Bybit, OKX, KuCoin, Gate, Bitget, HTX, MEXC, BitMart, DigiFinex) |
| **Direct On-Chain Settlement** | Bot calls `resolveWithCustomPrice(price)` with historical median price at exact `endTime` |
| **Real-Time Price Chart** | Live 1m candle chart aggregated from 10 CEXes via CCXT |
| **Time-Gated Betting** | Betting closes before `endTime` — enforced on-chain via `bettingEndTime` |
| **Platform Fee** | 1% fee per bet in native token. Winners claim 100% proportional payout |
| **Faucet** | Claim free SkyUSDT to start betting (testnet only) |
| **Portfolio History** | View all past bets and claim winnings from resolved markets |
| **Privy Auth** | Seamless wallet connection via Privy (social login + embedded wallet) |
| **PM2 Auto-Scheduler** | Bot sweeps every 60s — creates markets + resolves expired ones |
| **Leaderboard** | On-chain leaderboard tracking top bettors |
| **Admin Panel** | Protected admin dashboard for market oversight |

---

## 📁 Project Structure

```
sky-predict/
├── contracts/                    ← Seismic testnet contract workspace
│   ├── contracts/
│   │   ├── BetCOFI.sol           ← Core bet contract (GenLayer compatible)
│   │   ├── BetFactoryCOFI.sol    ← Factory: create & track all bets
│   │   ├── ChainlinkOracle.sol   ← Fallback price oracle (Chainlink)
│   │   ├── IPriceOracle.sol      ← Oracle interface
│   │   ├── PredictionMarket.sol  ← Legacy: direct price resolution
│   │   ├── SkyUSDT.sol           ← Mock ERC-20 faucet token
│   │   └── MockOracle.sol        ← Testing oracle
│   ├── scripts/
│   │   └── deploy.ts             ← Deploy to Seismic testnet
│   └── legacy_deployment.json    ← Latest deployed contract addresses
├── scripts/
│   ├── auto-market.js            ← PM2 bot: auto-create & resolve markets
│   ├── auto-market.ts            ← TypeScript source of the bot
│   └── deploy.ts                 ← Root deployment helper
├── frontend/                     ← Next.js 16 frontend (deployed on Vercel)
│   ├── src/app/
│   │   ├── page.tsx              ← Landing page
│   │   ├── markets/[id]/         ← Market detail + betting panel
│   │   ├── faucet/               ← Faucet claim page
│   │   ├── leaderboard/          ← On-chain leaderboard
│   │   ├── admin/                ← Protected admin dashboard
│   │   └── api/
│   │       ├── price/route.ts    ← Live price: median from 10 CEXes
│   │       └── history/route.ts  ← OHLCV history (?symbol=BTC/USDT)
│   ├── src/components/
│   │   ├── Header/               ← Navbar + Privy wallet connect
│   │   ├── MarketCard/           ← Market grid card component
│   │   ├── MarketExpanded/       ← Full market detail + chart + betting
│   │   ├── SharedMarket/         ← ProbabilityGauge + shared UI
│   │   ├── LandingView/          ← Hero landing section
│   │   ├── GenLayerInfo/         ← GenLayer oracle info banner
│   │   └── Wallet/               ← Wallet state components
│   ├── src/data/markets.ts       ← Shared market types & data helpers
│   └── src/lib/onchain/
│       ├── reads.ts              ← Read contract state (markets, bets)
│       └── writes.ts             ← Write contract calls (bet, claim, resolve)
├── ecosystem.config.js           ← PM2 configuration
└── hardhat.config.ts             ← Hardhat + Seismic network config
```

---

## 🛠 Prerequisites

- **Node.js** v18+
- **Privy Account** → [Get App ID at privy.io](https://dashboard.privy.io/)
- **Seismic Testnet RPC** → `https://gcp-1.seismictest.net/rpc` (Chain ID: 5124)
- **Deployer Wallet** with Seismic testnet ETH
- **PM2** (optional, for running the auto-market bot): `npm i -g pm2`

---

## 1️⃣ Setup — Root (Contracts + Bot)

```bash
git clone https://github.com/skyzee2706/skypredict.git
cd skypredict

# Install root dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
```

**.env** (root — for Hardhat and the bot):
```env
PRIVATE_KEY=your_deployer_private_key_without_0x
SEISMIC_RPC_URL=https://gcp-1.seismictest.net/rpc
SEISMIC_EXPLORER_API_KEY=
SEISMIC_EXPLORER_API_URL=https://seismic-testnet.socialscan.io/api
```

---

## 2️⃣ Deploy Contracts to Seismic Testnet

```bash
# Compile contracts
npx hardhat compile

# Deploy to Seismic testnet
npx hardhat run scripts/deploy.ts --network seismic
```

Save the deployed addresses, then fill them into `frontend/.env.local`.

---

## 3️⃣ Setup Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in your actual values
npm install
npm run dev
```

**frontend/.env.local**:
```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your_privy_client_id

NEXT_PUBLIC_BET_FACTORY_ADDRESS=0x...   # BetFactoryCOFI address
NEXT_PUBLIC_OWNER_ADDRESS=0x...          # Deployer/owner address
NEXT_PUBLIC_BRIDGE_SERVICE_URL=https://your-vercel-app.vercel.app
```

Visit `http://localhost:3000`

---

## 4️⃣ Run the Auto-Market Bot (PM2)

The bot automatically:
- Creates **Hourly** and **Daily** markets for **all 6 assets** (BTC, ETH, SOL, XRP, DOGE, BNB)
- Fetches **historical median price** from 10 CEXes at exact `endTime` to resolve each market
- Submits resolution on-chain via `resolveWithCustomPrice(price)` — no external oracle needed

```bash
# From root directory
pm2 start ecosystem.config.js
pm2 logs sky-market-scheduler
```

The bot runs on a **60-second sweep** cycle:
1. Fetches all markets from `BetFactoryCOFI.getAllMarkets()`
2. For each **unresolved expired** market → fetches historical median from 10 CEXes at `endTime` → calls `resolveWithCustomPrice(scaledPrice)`
3. For each ticker (BTC/ETH/SOL/XRP/DOGE/BNB) → creates new Hourly + Daily markets if none exist for the next window

Price scaling: prices are stored as `uint256` with **8 decimal precision** (e.g. `$94,500.00` → `9450000000000`).

---

---

## 📐 Architecture

```
User Browser
    │
    ├── Privy SDK          →  Wallet connect (social login / embedded wallet)
    ├── wagmi / viem       →  Seismic RPC (read contract state)
    ├── /api/price         →  10-CEX median price (CCXT) — live dot
    └── /api/history?symbol=BTC/USDT → 1m OHLCV history from 10 CEXes

PM2 Bot (scripts/auto-market.ts)
    │
    ├── factory.getAllMarkets()           →  scan all markets on-chain
    │
    ├── [RESOLVE PATH]
    │   ├── getHistoricalMedianPrice()   →  fetch 10-CEX 1m candle at endTime
    │   └── market.resolveWithCustomPrice(scaledPrice)  →  settle on-chain
    │
    └── [CREATE PATH]
        ├── getLiveMedianPrice(ticker)   →  fetch 10-CEX live median as strike
        └── factory.createMarket(question, strike, endTime, bettingEndTime)
```

---

## 📊 Supported Assets (Price API)

The `/api/history` and `/api/price` endpoints accept any CCXT-compatible symbol:

| Asset | Symbol Param |
|---|---|
| Bitcoin | `BTC/USDT` |
| Ethereum | `ETH/USDT` |
| Solana | `SOL/USDT` |
| XRP | `XRP/USDT` |
| Dogecoin | `DOGE/USDT` |
| BNB | `BNB/USDT` |

Example: `GET /api/history?symbol=ETH/USDT&since=1700000000`

---

## 💰 Fee Structure

| Action | Fee |
|---|---|
| Place Bet | 1% of bet amount, paid in native token upfront |
| Claim Winnings | Free — 100% proportional payout from losing pool |
| Lose | Original bet stays in the losing pool |
| UNDETERMINED Market | Full refund claimable by all bettors |

---

## 🔗 Resources

| Resource | Link |
|---|---|
| Live App | [skypredict.app](https://skypredict.app) |
| Seismic Explorer | [seismic-testnet.socialscan.io](https://seismic-testnet.socialscan.io) |
| Seismic Testnet RPC | [gcp-1.seismictest.net/rpc](https://gcp-1.seismictest.net/rpc) |
| CCXT Library | [github.com/ccxt/ccxt](https://github.com/ccxt/ccxt) |
| Privy Docs | [docs.privy.io](https://docs.privy.io) |

---

## 📄 License

MIT — Built for Seismic Testnet. Not audited. Use at your own risk.
