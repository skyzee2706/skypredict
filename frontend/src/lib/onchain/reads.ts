import { Abi } from 'viem';
import { readContract } from 'wagmi/actions';
import { seismicTestnet } from './seismicChain';
import { wagmiConfig } from './wagmiConfig';
import type { MarketData, MarketState } from '../../data/markets';
import MarketFactoryArtifact from '../../lib/contracts/MarketFactory.json';
import PredictionMarketArtifact from '../../lib/contracts/PredictionMarket.json';
import { FACTORY_ADDRESS } from '../constants';

const FACTORY_ABI = MarketFactoryArtifact as Abi;
const MARKET_ABI = PredictionMarketArtifact as Abi;

function isFactoryConfigured() {
  const isZero = FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000';
  const hasAbi = Array.isArray(FACTORY_ABI) && FACTORY_ABI.length > 0;
  return !isZero && hasAbi;
}

function computeState(resolved: boolean, bettingEndTime: number, endTime: number): MarketState {
  if (resolved) return 'RESOLVED';
  const now = Math.floor(Date.now() / 1000);
  if (now < bettingEndTime) return 'ACTIVE';
  return 'RESOLVING';
}

function inferDuration(question: string): number {
  const q = question.toLowerCase();
  if (q.includes('midnight') || q.includes('daily')) return 24 * 60 * 60;
  return 60 * 60;
}

async function fetchMarketInfo(marketAddress: `0x${string}`): Promise<MarketData> {
  const [
    question,
    strikePriceRaw,
    endTimeRaw,
    bettingEndTimeRaw,
    resolved,
    result,
    yesPoolRaw,
    noPoolRaw,
    yesPriceRaw,
    settlementPriceRaw
  ] = await Promise.all([
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'question'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'strikePrice'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'endTime'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'bettingEndTime'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'resolved'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'result'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'yesPool'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'noPool'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'yesPrice'
    }),
    readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'settlementPrice'
    })
  ]);

  const q = String(question);
  const strikePrice = Number(strikePriceRaw) / 1e8;
  const endTime = Number(endTimeRaw);
  const bettingEndTime = Number(bettingEndTimeRaw);
  const isResolved = Boolean(resolved);
  const isYesWinner = Boolean(result);
  const yesPool = Number(yesPoolRaw) / 1e6;
  const noPool = Number(noPoolRaw) / 1e6;
  const yesPrice = Number(yesPriceRaw) / 1e16;
  const totalVolume = yesPool + noPool;
  const state = computeState(isResolved, bettingEndTime, endTime);
  const duration = inferDuration(q);

  return {
    id: marketAddress,
    contractId: marketAddress,
    title: q,
    ticker: 'BTC',
    sideAName: 'YES',
    sideBName: 'NO',
    description: `Resolve source: median 10 exchanges at market end timestamp.`,
    type: 'crypto',
    category: 'CRYPTO',
    identifier: 'BTCUSDT',
    creationDate: endTime - duration,
    deadline: endTime,
    deadlineDate: new Date(endTime * 1000).toISOString(),
    bettingEndTime,
    strikePrice,
    resolutionSource: 'Median 10 exchanges',
    resolutionRule: 'YES wins when BTC/USD >= strike price at end time (UTC).',
    liquidity: totalVolume,
    volume: totalVolume,
    state,
    resolvedOutcome: isResolved ? (isYesWinner ? 'YES' : 'NO') : undefined,
    deadlinePrice: isResolved ? Number(settlementPriceRaw) / 1e8 : undefined,
    priceSymbol: '$',
    probYes: Math.max(0, Math.min(100, yesPrice)) / 100,
    probNo: 1 - Math.max(0, Math.min(100, yesPrice)) / 100,
    percentChange: 0,
    statsLoading: false
  };
}

async function fetchAllMarketsRaw(): Promise<`0x${string}`[]> {
  if (!isFactoryConfigured()) return [];
  try {
    const raw = await readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: FACTORY_ADDRESS as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getAllMarkets'
    });
    return (raw as `0x${string}`[]) || [];
  } catch (error) {
    console.error('Failed to fetch markets from factory:', error);
    return [];
  }
}

export async function fetchMarketsByStatus(status: MarketState): Promise<MarketData[]> {
  const addresses = await fetchAllMarketsRaw();
  const markets = await Promise.all(
    addresses.map(async (addr) => {
      try {
        return await fetchMarketInfo(addr);
      } catch (error) {
        console.error('Failed market read:', addr, error);
        return null;
      }
    })
  );

  const cleaned = markets.filter((m): m is MarketData => m !== null);

  if (status === 'UNDETERMINED') return [];

  return cleaned
    .filter((m) => m.state === status)
    .sort((a, b) => Number(a.deadline) - Number(b.deadline));
}

export async function fetchAllMarkets(
  statuses: MarketState[] = ['ACTIVE', 'RESOLVING', 'RESOLVED', 'UNDETERMINED']
) {
  const requested = statuses.filter((s) => s !== 'UNDETERMINED');
  const results = await Promise.all(requested.map((s) => fetchMarketsByStatus(s)));
  return results.flat();
}
