# COFI - Court of Internet Smart Contracts

Binary prediction markets on Base. Let the internet decide.

## Quick Start

```bash
npm install
cp .env.example .env
# Add your PRIVATE_KEY and BASESCAN_API_KEY to .env
npm run compile
npm run deploy:sepolia
```

## Commands

```bash
npm run compile              # Compile contracts
npm run test                 # Run tests
npm run deploy:factory:sepolia  # Deploy BetFactory to Base Sepolia testnet
npm run deploy:factory:base     # Deploy BetFactory to Base mainnet
```

## Resolve a Bet

```bash
BET_CONTRACT_ADDRESS=0x... npx hardhat run scripts/resolve-bet.ts --network baseSepolia
```

## Contracts

### BetFactory

Factory contract for creating SimpleBet instances. Deployed once by the house owner.

**Key features:**
- House address = factory deployer (automatic)
- Creates SimpleBet contracts via `createBet()`
- Tracks all created bets in `allBets` array
- Emits `BetCreated` event with new bet address

**Deployed addresses:**
- Base Sepolia: `0xAcF262A6745Ef29a3ebdE6197E01B03938f0ea51`

### SimpleBet

Binary prediction market where anyone can bet USDC on Side A or Side B.

**Flow:**
1. Created by BetFactory (creator = tx sender, house = factory deployer)
2. Users bet USDC on either side until end date
3. Creator resolves bet (currently random, GenLayer oracle coming soon)
4. Winners claim proportional share of losing pool

**Networks:**
- Base Sepolia Testnet (Chain ID: 84532)
- Base Mainnet (Chain ID: 8453)

**Testnet USDC:** 0x036CbD53842c5426634e7929541eC2318f3dCF7e

## Get Testnet Tokens

- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
- [Base Bridge](https://bridge.base.org/)
