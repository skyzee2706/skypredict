import { Abi, createPublicClient, http } from 'viem';
import { getAccount, writeContract, switchChain } from '@wagmi/core';
import { seismicTestnet } from './seismicChain';
import { wagmiConfig } from './wagmiConfig';
import MarketFactoryArtifact from '../contracts/MarketFactory.json';
import PredictionMarketArtifact from '../contracts/PredictionMarket.json';
import { FACTORY_ADDRESS, TOKEN_ADDRESS, SKYUSD_ABI, SKYUSD_MULTIPLIER } from '../constants';

const FACTORY_ABI = MarketFactoryArtifact.abi as unknown as Abi;
const MARKET_ABI = PredictionMarketArtifact.abi as unknown as Abi;

function getPublicClient() {
  return createPublicClient({
    chain: seismicTestnet,
    transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || process.env.NEXT_PUBLIC_SEISMIC_RPC_URL || 'https://rpc.ritualfoundation.org')
  });
}

export type MarketOutcome = 'YES' | 'NO' | 'DRAW';

export async function placeBet(marketAddress: `0x${string}`, outcome: MarketOutcome, amount: number): Promise<void> {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  const publicClient = getPublicClient();
  const account = getAccount(wagmiConfig);
  if (!account.address) throw new Error('Wallet not connected');

  const amountInUnits = BigInt(Math.floor(amount * SKYUSD_MULTIPLIER));
  if (amountInUnits <= 0n) {
    throw new Error('Bet amount must be greater than zero.');
  }

  // Pre-flight: check betting deadline
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

  // Pre-flight: check token balance
  const balance = (await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  })) as bigint;

  if (balance < amountInUnits) {
    throw new Error(`Insufficient SkyUSD balance. You have ${Number(balance) / SKYUSD_MULTIPLIER} but need ${amount}.`);
  }

  // Pre-flight: check allowance
  const allowance = (await publicClient.readContract({
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'allowance',
    args: [account.address, marketAddress]
  })) as bigint;

  if (allowance < amountInUnits) {
    throw new Error('Insufficient SkyUSD allowance. Please approve the market contract first.');
  }

  const functionName = outcome === 'YES' ? 'buyYes' : outcome === 'NO' ? 'buyNo' : 'buyDraw';

  await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: marketAddress,
    abi: MARKET_ABI,
    functionName,
    args: [amountInUnits]
  });
}

export async function claimRewards(marketAddress: `0x${string}`): Promise<void> {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'claim',
    args: []
  });
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
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'approve',
    args: [spenderAddress, maxUint256]
  });
}

export async function dripUsdl(): Promise<void> {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  const account = getAccount(wagmiConfig);
  if (!account.address) throw new Error('Wallet not connected');

  await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: TOKEN_ADDRESS as `0x${string}`,
    abi: SKYUSD_ABI,
    functionName: 'faucet',
    args: [account.address as `0x${string}`],
    gas: 100000n,
  });
}

export async function isLegitBet(marketAddress: `0x${string}`): Promise<boolean> {
  const publicClient = getPublicClient();
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
}

export async function calculateUserWinnings(marketAddress: `0x${string}`, userAddress: `0x${string}`): Promise<{ ifSideAWins: number; ifDrawWins: number; ifSideBWins: number }> {
  const publicClient = getPublicClient();

  const [sideAPoolRaw, drawPoolRaw, sideBPoolRaw, userPos] = await Promise.all([
    publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'yesPool', args: [] }),
    publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'drawPool', args: [] }),
    publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'noPool', args: [] }),
    publicClient.readContract({ address: marketAddress, abi: MARKET_ABI, functionName: 'getUserPosition', args: [userAddress] })
  ]);

  const [sideABetRaw, drawBetRaw, sideBBetRaw] = userPos as [bigint, bigint, bigint, boolean];
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
