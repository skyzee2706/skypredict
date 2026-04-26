## Wallet-connected write methods (Base chain)

- `connectWallet(chain: 'base' = 'base'): Promise<string>` — initiate wallet connection and return address (stubbed in `src/lib/onchain/writes.ts`).
- `disconnectWallet(): Promise<void>` — clear wallet session (handled in `WalletProvider`, stubbed for local dev).
- `placeBet(marketId: number, outcome: 'YES' | 'NO', amount: number): Promise<void>` — single betting entry point used by all trade UIs; wired to wagmi actions (stubbed until ABI/address are set) in `src/lib/onchain/writes.ts`.
- `claimRewards(marketId: number): Promise<void>` — single claim entry point used across cards/detail/full-page/trade box; wired to wagmi actions (stubbed until ABI/address are set) in `src/lib/onchain/writes.ts`.
- `resolveMarket(marketId: number): Promise<void>` — admin/ops resolution hook (stubbed, wagmi-wired) in `src/lib/onchain/writes.ts`, if needed for back-office flows.

## UI integration touch-points

- Wallet state lives in `WalletProvider` (`src/app/providers/WalletProvider.tsx`); wrap app in provider (already wired in `layout.tsx`).
- Consistent connect CTA: `ConnectWalletPrompt` (`src/app/components/Wallet/ConnectWalletPrompt.tsx`) is used across betting (TradeBox), finalized stakes, and resolving position sections.
- Betting UI (`TradeBox`) and claim buttons gate actions on `isConnected`; disconnected users see the shared connect prompt instead of mixed states.

Swap stubbed functions with Privy/Base implementations; UI should require no structural changes beyond wiring the real methods.

## Privy integration notes

- Privy React provider is initialized in `WalletProvider` using `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID`. When set, the Privy login/logout flows back the `connect/disconnect` methods; when absent, the fallback stub is used for local dev.
- Set both `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID` in your environment and install `@privy-io/react-auth` (`frontend/package.json` dependency added) before running the app. Replace stubbed chain calls in `src/data/markets.ts` with real Base interactions after Privy connection succeeds.
