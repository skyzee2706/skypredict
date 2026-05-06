import { Abi } from 'viem';
import { readContract } from 'wagmi/actions';
import { seismicTestnet } from './seismicChain';
import { wagmiConfig } from './wagmiConfig';
import type { MarketData, MarketState } from '../../data/markets';
import MarketFactoryArtifact from '../../lib/contracts/MarketFactory.json';
import PredictionMarketArtifact from '../../lib/contracts/PredictionMarket.json';
import { FACTORY_ADDRESS } from '../constants';

const FACTORY_ABI = MarketFactoryArtifact.abi as unknown as Abi;
const MARKET_ABI = PredictionMarketArtifact.abi as unknown as Abi;

function isFactoryConfigured() {
  const isZero = FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000';
  const hasAbi = Array.isArray(FACTORY_ABI) && FACTORY_ABI.length > 0;
  return !isZero && hasAbi;
}

function computeState(resolved: boolean, bettingEndTime: number, _endTime: number): MarketState {
  if (resolved) return 'RESOLVED';
  const now = Math.floor(Date.now() / 1000);
  if (now < bettingEndTime) return 'ACTIVE';
  return 'RESOLVING';
}

function inferDuration(question: string): number {
  const q = question.toLowerCase();
  if (q.includes('midnight') || q.includes('daily')) return 24 * 60 * 60;
  if (q.includes(' vs ')) return 5 * 24 * 60 * 60; // sports
  return 60 * 60;
}

function inferTicker(question: string): string {
  const tickers = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'];
  const q = question.toUpperCase();
  return tickers.find((t) => q.includes(`${t}/USD`) || q.includes(t)) || 'BTC';
}

/** Safely read a contract value, returning fallback on any error */
async function safeRead<T>(marketAddress: `0x${string}`, functionName: string, fallback: T): Promise<T> {
  try {
    return await readContract(wagmiConfig, {
      chainId: seismicTestnet.id,
      address: marketAddress,
      abi: MARKET_ABI,
      functionName
    }) as T;
  } catch {
    return fallback;
  }
}

/** Detect if this market is a sports market by checking if `marketType` returns 'SPORTS' */
function isSportsMarket(question: string, marketTypeRaw: string): boolean {
  const mt = String(marketTypeRaw).toUpperCase();
  if (mt === 'SPORTS') return true;
  // Fallback heuristic: "X vs Y" pattern
  if (question.includes(' vs ')) return true;
  return false;
}

async function fetchMarketInfo(marketAddress: `0x${string}`): Promise<MarketData> {
  // Read core fields (always present in both old and new contracts)
  const [
    question,
    strikePriceRaw,
    endTimeRaw,
    bettingEndTimeRaw,
    resolved,
    yesPoolRaw,
    noPoolRaw,
    settlementPriceRaw
  ] = await Promise.all([
    safeRead<string>(marketAddress, 'question', ''),
    safeRead<bigint>(marketAddress, 'strikePrice', 0n),
    safeRead<bigint>(marketAddress, 'endTime', 0n),
    safeRead<bigint>(marketAddress, 'bettingEndTime', 0n),
    safeRead<boolean>(marketAddress, 'resolved', false),
    safeRead<bigint>(marketAddress, 'yesPool', 0n),
    safeRead<bigint>(marketAddress, 'noPool', 0n),
    safeRead<bigint>(marketAddress, 'settlementPrice', 0n)
  ]);

  // Read new 3-way fields (may fail on old contracts, hence safeRead)
  const [
    drawPoolRaw,
    sideANameRaw,
    drawNameRaw,
    sideBNameRaw,
    marketTypeRaw,
    winningOutcomeRaw,
    resultRaw,
    yesPriceRaw
  ] = await Promise.all([
    safeRead<bigint>(marketAddress, 'drawPool', 0n),
    safeRead<string>(marketAddress, 'sideAName', ''),
    safeRead<string>(marketAddress, 'drawName', ''),
    safeRead<string>(marketAddress, 'sideBName', ''),
    safeRead<string>(marketAddress, 'marketType', ''),
    safeRead<number>(marketAddress, 'winningOutcome', 0),
    safeRead<boolean>(marketAddress, 'result', false),
    safeRead<bigint>(marketAddress, 'yesPrice', 0n)
  ]);

  const q = String(question);
  const isSport = isSportsMarket(q, String(marketTypeRaw));

  // Side labels
  const sideAName = String(sideANameRaw) || 'YES';
  const drawName = String(drawNameRaw) || 'Draw';
  const sideBName = String(sideBNameRaw) || 'NO';

  // Pool values
  const strikePrice = Number(strikePriceRaw) / 1e8;
  const endTime = Number(endTimeRaw);
  const bettingEndTime = Number(bettingEndTimeRaw);
  const sideAPool = Number(yesPoolRaw) / 1e6;
  const drawPool = Number(drawPoolRaw) / 1e6;
  const sideBPool = Number(noPoolRaw) / 1e6;
  const totalVolume = sideAPool + drawPool + sideBPool;
  const duration = inferDuration(q);
  const state = computeState(Boolean(resolved), bettingEndTime, endTime);

  // Resolve winning outcome
  const winnerIndex = Number(winningOutcomeRaw);
  let resolvedOutcome: string | undefined;
  if (Boolean(resolved)) {
    // New contracts store winningOutcome as enum (0=SideA, 1=Draw, 2=SideB)
    if (winnerIndex === 1) resolvedOutcome = drawName;
    else if (winnerIndex === 2) resolvedOutcome = sideBName;
    else resolvedOutcome = sideAName;

    // Fallback for old contracts that only have `result` bool
    if (!String(marketTypeRaw) && winnerIndex === 0) {
      resolvedOutcome = Boolean(resultRaw) ? sideAName : sideBName;
    }
  }

  // Probabilities
  let probA: number, probD: number, probB: number;
  if (totalVolume > 0) {
    probA = sideAPool / totalVolume;
    probD = drawPool / totalVolume;
    probB = sideBPool / totalVolume;
  } else if (isSport) {
    probA = 0.4; probD = 0.2; probB = 0.4;
  } else {
    // Use yesPrice from old contract if available
    const yp = Number(yesPriceRaw) / 1e16;
    probA = yp > 0 && yp <= 100 ? yp / 100 : 0.5;
    probD = 0;
    probB = 1 - probA;
  }

  return {
    id: marketAddress,
    contractId: marketAddress,
    title: q,
    ticker: isSport ? 'SPORT' : inferTicker(q),
    sideAName,
    drawName,
    sideBName,
    description: isSport
      ? `Football match — market closes at kickoff.`
      : `Resolves via median of 10 exchange prices at market close.`,
    type: isSport ? 'sport' : 'crypto',
    category: isSport ? 'SPORTS' : 'CRYPTO',
    identifier: isSport ? q.replace(/\s+/g, '-').toLowerCase() : `${inferTicker(q)}USDT`,
    creationDate: Math.max(0, endTime - duration),
    deadline: endTime,
    deadlineDate: endTime > 0 ? new Date(endTime * 1000).toISOString() : undefined,
    bettingEndTime,
    strikePrice: isSport ? undefined : strikePrice,
    resolutionSource: isSport ? 'Live score API' : 'Median 10 exchanges',
    resolutionRule: isSport
      ? `${sideAName} wins if they win, ${drawName} if level, ${sideBName} if they win.`
      : `${sideAName} wins when price >= strike at close.`,
    liquidity: totalVolume,
    volume: totalVolume,
    state,
    resolvedOutcome,
    deadlinePrice: !isSport && Boolean(resolved) ? Number(settlementPriceRaw) / 1e8 : undefined,
    priceSymbol: isSport ? '' : '$',
    probYes: probA,
    probDraw: probD,
    probNo: probB,
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

export async function fetchAllMarkets(
  statuses: MarketState[] = ['ACTIVE', 'RESOLVING', 'RESOLVED', 'UNDETERMINED']
): Promise<MarketData[]> {
  const addresses = await fetchAllMarketsRaw();
  
  // Chunking to prevent RPC 429 errors
  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      return arr.reduce((acc, _, i) => {
          if (i % size === 0) acc.push(arr.slice(i, i + size));
          return acc;
      }, [] as T[][]);
  };

  const marketChunks = chunkArray(addresses, 5);
  const allMarkets: MarketData[] = [];

  for (const chunk of marketChunks) {
      const chunkResults = await Promise.all(
          chunk.map(async (addr) => {
              try {
                  return await fetchMarketInfo(addr);
              } catch (error) {
                  console.error('Failed market read:', addr, error);
                  return null;
              }
          })
      );
      allMarkets.push(...chunkResults.filter((m): m is MarketData => m !== null));
      // Add a 200ms delay between chunks to avoid 429 Too Many Requests
      await new Promise(r => setTimeout(r, 200));
  }

  return allMarkets
    .filter((m) => {
      if (statuses.includes('UNDETERMINED') && m.state !== 'RESOLVED') {
        const deadline = Number(m.deadline);
        const now = Math.floor(Date.now() / 1000);
        if (deadline > 0 && deadline < now) return true;
      }
      return statuses.includes(m.state);
    })
    .sort((a, b) => Number(a.deadline) - Number(b.deadline));
}

export async function fetchMarketsByStatus(status: MarketState): Promise<MarketData[]> {
    return fetchAllMarkets([status]);
}
