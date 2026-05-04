import { Abi } from 'viem';
import { writeContract, switchChain } from '@wagmi/core';
import { seismicTestnet } from './seismicChain';
import { wagmiConfig } from './wagmiConfig';
import MarketFactoryArtifact from '../contracts/MarketFactory.json';
import PredictionMarketArtifact from '../contracts/PredictionMarket.json';
import { FACTORY_ADDRESS } from '../constants';

const FACTORY_ABI = MarketFactoryArtifact.abi as unknown as Abi;
const MARKET_ABI = PredictionMarketArtifact.abi as unknown as Abi;

function isFactoryConfigured() {
  const isZero = FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000';
  const hasAbi = Array.isArray(FACTORY_ABI) && FACTORY_ABI.length > 0;
  return !isZero && hasAbi;
}

function parseStrikeFromTitle(title: string): bigint {
  const match = title.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  const fallback = 50000;
  const parsed = match ? Number(match[1].replace(/,/g, '')) : fallback;
  return BigInt(Math.floor(parsed * 1e8));
}

export async function createBet(params: {
  title: string;
  resolutionCriteria: string;
  sideAName: string;
  sideBName: string;
  endDate: number;
  resolutionType: number;
  resolutionData: `0x${string}`;
}) {
  if (!isFactoryConfigured()) return;

  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });

  const strikePrice = parseStrikeFromTitle(params.title);
  const bettingEndTime = Math.max(0, params.endDate - 15 * 60);

  const hash = await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: FACTORY_ADDRESS as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'createMarket',
    args: [params.title, strikePrice, BigInt(params.endDate), BigInt(bettingEndTime)]
  });

  return hash;
}

export async function setCreatorApproval(_creator: `0x${string}`, _approved: boolean) {
  // Old MarketFactory does not support creator approval gating.
  return;
}

export async function resolveBet(marketAddress: `0x${string}`) {
  await switchChain(wagmiConfig, { chainId: seismicTestnet.id });

  await writeContract(wagmiConfig, {
    chainId: seismicTestnet.id,
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'resolve',
    args: []
  });
}
