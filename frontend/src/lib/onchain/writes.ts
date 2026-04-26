import { Abi, createPublicClient, http } from 'viem';
import { getAccount, writeContract, switchChain } from '@wagmi/core';
import { seismicTestnet } from './seismicChain';
import { wagmiConfig } from './wagmiConfig';
import MarketFactoryArtifact from '../contracts/MarketFactory.json';
import PredictionMarketArtifact from '../contracts/PredictionMarket.json';
import { FACTORY_ADDRESS, TOKEN_ADDRESS, SKYUSD_ABI, SKYUSD_MULTIPLIER } from '../constants';

const FACTORY_ABI = MarketFactoryArtifact as Abi;
const MARKET_ABI = PredictionMarketArtifact as Abi;

function getPublicClient() {
  return createPublicClient({
    chain: seismicTestnet,
    transport: http(process.env.NEXT_PUBLIC_SEISMIC_RPC_URL || 'https://gcp-1.seismictest.net/rpc')
  });
}

export async function placeBet(marketAddress: `0x${string}`, outcome: 'YES' | 'NO', amount: number): Promise<void> {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });
  const publicClient = getPublicClient();

  const amountInUnits = BigInt(Math.floor(amount * SKYUSD_MULTIPLIER));
  const feeWei = (await publicClient.readContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'calcEthFee',
    args: [amountInUnits]
  })) as bigint;

  await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: outcome === 'YES' ? 'buyYes' : 'buyNo',
    args: [amountInUnits],
    value: feeWei
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
  if (!account.address) {
    throw new Error('Wallet not connected');
  }

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

export async function getUserBets(marketAddress: `0x${string}`, userAddress: `0x${string}`): Promise<{ onSideA: number; onSideB: number; claimed?: boolean }> {
  const publicClient = getPublicClient();
  const result = await publicClient.readContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'getUserPosition',
    args: [userAddress]
  });

  const [yesBet, noBet, claimed] = result as [bigint, bigint, boolean];
  return {
    onSideA: Number(yesBet) / SKYUSD_MULTIPLIER,
    onSideB: Number(noBet) / SKYUSD_MULTIPLIER,
    claimed
  };
}

export async function calculateUserWinnings(marketAddress: `0x${string}`, userAddress: `0x${string}`): Promise<{ ifSideAWins: number; ifSideBWins: number }> {
  const publicClient = getPublicClient();

  const [yesPoolRaw, noPoolRaw, userPos] = await Promise.all([
    publicClient.readContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'yesPool',
      args: []
    }),
    publicClient.readContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'noPool',
      args: []
    }),
    publicClient.readContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'getUserPosition',
      args: [userAddress]
    })
  ]);

  const yesPool = Number(yesPoolRaw) / SKYUSD_MULTIPLIER;
  const noPool = Number(noPoolRaw) / SKYUSD_MULTIPLIER;
  const [yesBetRaw, noBetRaw] = userPos as [bigint, bigint, boolean];
  const yesBet = Number(yesBetRaw) / SKYUSD_MULTIPLIER;
  const noBet = Number(noBetRaw) / SKYUSD_MULTIPLIER;
  const total = yesPool + noPool;

  const ifSideAWins = yesPool > 0 ? (yesBet * total) / yesPool : 0;
  const ifSideBWins = noPool > 0 ? (noBet * total) / noPool : 0;

  return { ifSideAWins, ifSideBWins };
}
