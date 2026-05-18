import { Abi, createPublicClient, http, parseEther } from 'viem';
import { getAccount, writeContract, switchChain, getChainId } from '@wagmi/core';
import { seismicTestnet } from './seismicChain';
import { wagmiConfig } from './wagmiConfig';
import PredictionMarketArtifact from '../contracts/PredictionMarket.json';
import { TOKEN_ADDRESS, SKYUSD_ABI, SKYUSD_MULTIPLIER, ROUTER_ADDRESS, ROUTER_ABI } from '../constants';

const MARKET_ABI = PredictionMarketArtifact.abi as unknown as Abi;

function getPublicClient() {
  return createPublicClient({
    chain: seismicTestnet,
    transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org')
  });
}

async function waitForConfirmedReceipt(hash: `0x${string}`): Promise<void> {
  const publicClient = getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('Transaction failed on-chain.');
  }
}

async function ensureRitualWallet(): Promise<void> {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  const activeChainId = getChainId(wagmiConfig);
  if (activeChainId !== seismicTestnet.id) {
    throw new Error(`Wrong network. Please switch your wallet to Ritual Network (${seismicTestnet.id}).`);
  }
}

export type MarketOutcome = 'YES' | 'NO' | 'DRAW';

/**
 * Check if user has approved SkyUSD to the Router.
 * Returns true if allowance >= a very large amount (effectively unlimited).
 */
export async function isRouterApproved(userAddress: `0x${string}`): Promise<boolean> {
  const publicClient = getPublicClient();
  const allowance = (await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'allowance',
    args: [userAddress, ROUTER_ADDRESS]
  })) as bigint;

  // Considered "approved" if allowance > 1 billion tokens (effectively unlimited)
  const threshold = BigInt(1_000_000_000) * BigInt(SKYUSD_MULTIPLIER);
  return allowance >= threshold;
}

/**
 * Approve SkyUSD to the Router (once, unlimited).
 * After this, all bets on any market only need 1 tx each.
 */
export async function approveRouter(): Promise<void> {
  await ensureRitualWallet();
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'approve',
    args: [ROUTER_ADDRESS, maxUint256]
  });
  await waitForConfirmedReceipt(hash);
}

/**
 * Place a bet via the Router. Requires prior approval to Router.
 * This is always a single transaction — no per-market approval needed.
 */
export async function placeBet(marketAddress: `0x${string}`, outcome: MarketOutcome, amount: number): Promise<void> {
  await ensureRitualWallet();
  const publicClient = getPublicClient();
  const account = getAccount(wagmiConfig);
  if (!account.address) throw new Error('Wallet not connected');

  const amountInUnits = BigInt(Math.floor(amount * SKYUSD_MULTIPLIER));
  if (amountInUnits <= 0n) {
    throw new Error('Bet amount must be greater than zero.');
  }

  // Check betting deadline
  const bettingEndTime = (await publicClient.readContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'bettingEndTime',
    args: []
  })) as bigint;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec >= bettingEndTime) {
    throw new Error('Betting is closed for this market. The deadline has passed.');
  }

  // Check balance
  const balance = (await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  })) as bigint;

  if (balance < amountInUnits) {
    throw new Error(`Insufficient SkyUSD balance. You have ${Number(balance) / SKYUSD_MULTIPLIER} but need ${amount}.`);
  }

  // Check Router allowance for this exact bet amount — auto-approve if needed.
  // Do not rely on the UI's "unlimited approval" threshold; a smaller existing
  // allowance can still be valid for the current amount.
  const allowance = await checkUsdlAllowance(account.address, ROUTER_ADDRESS);
  if (allowance < amountInUnits) {
    await approveRouter();
  }

  // Map outcome to enum: 0 = SideA (YES), 1 = Draw, 2 = SideB (NO)
  const outcomeEnum = outcome === 'YES' ? 0 : outcome === 'DRAW' ? 1 : 2;

  // Place bet via Router — always 1 tx
  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: ROUTER_ADDRESS as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'placeBet',
    args: [marketAddress, outcomeEnum, amountInUnits]
  });
  await waitForConfirmedReceipt(hash);
}

export async function claimRewards(marketAddress: `0x${string}`): Promise<void> {
  await ensureRitualWallet();
  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'claim',
    args: []
  });
  await waitForConfirmedReceipt(hash);
}

export async function checkUsdlAllowance(userAddress: `0x${string}`, spenderAddress: `0x${string}`): Promise<bigint> {
  const publicClient = getPublicClient();
  const allowance = await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'allowance',
    args: [userAddress, spenderAddress]
  });
  return allowance as bigint;
}

export async function checkUsdlBalance(userAddress: `0x${string}`): Promise<bigint> {
  const publicClient = getPublicClient();
  const balance = await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'balanceOf',
    args: [userAddress]
  });
  return balance as bigint;
}

export async function approveUsdlUnlimited(spenderAddress: `0x${string}`): Promise<void> {
  await ensureRitualWallet();
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'approve',
    args: [spenderAddress, maxUint256]
  });
  await waitForConfirmedReceipt(hash);
}

/**
 * Deposit native RITUAL to receive SkyUSD.
 * @param ritualAmount Amount in RITUAL (e.g. 0.01 for minimum, up to 1.0)
 */
export async function depositRitual(ritualAmount: number = 0.01): Promise<void> {
  await ensureRitualWallet();
  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'deposit',
    args: [],
    value: parseEther(ritualAmount.toString())
  });
  await waitForConfirmedReceipt(hash);
}

export async function withdrawDepositFunds(recipient: `0x${string}`): Promise<void> {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'withdrawFunds',
    args: [recipient]
  });
  await waitForConfirmedReceipt(hash);
}

export async function getDepositBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  return (await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'depositBalance',
    args: []
  })) as bigint;
}

export async function isLegitBet(marketAddress: `0x${string}`): Promise<boolean> {
  const publicClient = getPublicClient();
  const MarketFactoryArtifact = await import('../contracts/MarketFactory.json');
  const FACTORY_ABI = MarketFactoryArtifact.abi as unknown as Abi;
  const { FACTORY_ADDRESS } = await import('../constants');
  const markets = (await publicClient.readContract({
    address: FACTORY_ADDRESS as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'getAllMarkets',
    args: []
  })) as `0x${string}`[];

  return markets.some((m) => m.toLowerCase() === marketAddress.toLowerCase());
}

export async function getUserBets(marketAddress: `0x${string}`, userAddress: `0x${string}`): Promise<{ onSideA: number; onDraw: number; onSideB: number; claimed?: boolean }> {
  const publicClient = getPublicClient();
  try {
    const result = await publicClient.readContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'getUserPosition',
      args: [userAddress]
    });

    const [sideABetRaw, drawBetRaw, sideBBetRaw, claimed] = result as [bigint, bigint, bigint, boolean];
    return {
      onSideA: Number(sideABetRaw) / SKYUSD_MULTIPLIER,
      onDraw: Number(drawBetRaw) / SKYUSD_MULTIPLIER,
      onSideB: Number(sideBBetRaw) / SKYUSD_MULTIPLIER,
      claimed
    };
  } catch {
    return { onSideA: 0, onDraw: 0, onSideB: 0, claimed: false };
  }
}

export async function calculateUserWinnings(marketAddress: `0x${string}`, userAddress: `0x${string}`): Promise<{ ifSideAWins: number; ifDrawWins: number; ifSideBWins: number }> {
  const publicClient = getPublicClient();

  let sideAPoolRaw = 0n, drawPoolRaw = 0n, sideBPoolRaw = 0n;
  let sideABetRaw = 0n, drawBetRaw = 0n, sideBBetRaw = 0n;

  try {
    const [aPool, dPool, bPool, userPos] = await Promise.all([
      publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'yesPool', args: [] }),
      publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'drawPool', args: [] }),
      publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'noPool', args: [] }),
      publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'getUserPosition', args: [userAddress] })
    ]);
    sideAPoolRaw = aPool as bigint;
    drawPoolRaw = dPool as bigint;
    sideBPoolRaw = bPool as bigint;
    const pos = userPos as [bigint, bigint, bigint, boolean];
    sideABetRaw = pos[0];
    drawBetRaw = pos[1];
    sideBBetRaw = pos[2];
  } catch {
    return { ifSideAWins: 0, ifDrawWins: 0, ifSideBWins: 0 };
  }

  const sideAPool = Number(sideAPoolRaw) / SKYUSD_MULTIPLIER;
  const drawPool = Number(drawPoolRaw) / SKYUSD_MULTIPLIER;
  const sideBPool = Number(sideBPoolRaw) / SKYUSD_MULTIPLIER;
  const sideABet = Number(sideABetRaw) / SKYUSD_MULTIPLIER;
  const drawBet = Number(drawBetRaw) / SKYUSD_MULTIPLIER;
  const sideBBet = Number(sideBBetRaw) / SKYUSD_MULTIPLIER;
  const total = sideAPool + drawPool + sideBPool;

  return {
    ifSideAWins: sideAPool > 0 ? ((sideABet * total) / sideAPool) * 0.9 : 0,
    ifDrawWins: drawPool > 0 ? ((drawBet * total) / drawPool) * 0.9 : 0,
    ifSideBWins: sideBPool > 0 ? ((sideBBet * total) / sideBPool) * 0.9 : 0
  };
}
