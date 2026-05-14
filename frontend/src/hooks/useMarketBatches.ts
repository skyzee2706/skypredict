import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { Abi } from 'viem';
import type { MarketData, MarketState } from '../data/markets';
import { FACTORY_ADDRESS, SKYUSD_MULTIPLIER } from '../lib/constants';
import MarketFactoryArtifact from '../lib/contracts/MarketFactory.json';
import PredictionMarketArtifact from '../lib/contracts/PredictionMarket.json';

const FACTORY_ABI = MarketFactoryArtifact.abi as unknown as Abi;
const MARKET_ABI = PredictionMarketArtifact.abi as unknown as Abi;
const ZERO_FACTORY = '0x0000000000000000000000000000000000000000';

const MARKET_FIELDS = [
  'question',
  'strikePrice',
  'endTime',
  'bettingEndTime',
  'resolved',
  'yesPool',
  'noPool',
  'settlementPrice',
  'drawPool',
  'sideAName',
  'drawName',
  'sideBName',
  'marketType',
  'winningOutcome',
  'result',
  'yesPrice'
] as const;

function computeState(resolved: boolean, bettingEndTime: number): MarketState {
  if (resolved) return 'RESOLVED';
  const now = Math.floor(Date.now() / 1000);
  return now < bettingEndTime ? 'ACTIVE' : 'RESOLVING';
}

function inferDuration(question: string): number {
  const q = question.toLowerCase();
  if (q.includes('midnight') || q.includes('daily')) return 24 * 60 * 60;
  if (q.includes(' vs ')) return 5 * 24 * 60 * 60;
  return 60 * 60;
}

function inferTicker(question: string): string {
  const tickers = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'];
  const q = question.toUpperCase();
  return tickers.find((t) => q.includes(`${t}/USD`) || q.includes(t)) || 'BTC';
}

function isSportsMarket(question: string, marketTypeRaw: string): boolean {
  const mt = String(marketTypeRaw).toUpperCase();
  return mt === 'SPORTS' || question.includes(' vs ');
}

function toBigInt(value: unknown, fallback = 0n): bigint {
  return typeof value === 'bigint' ? value : fallback;
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNumberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function buildMarketData(address: `0x${string}`, values: unknown[]): MarketData | null {
  const question = toStringValue(values[0]);
  if (!question) return null;

  const strikePriceRaw = toBigInt(values[1]);
  const endTimeRaw = toBigInt(values[2]);
  const bettingEndTimeRaw = toBigInt(values[3]);
  const resolved = toBoolean(values[4]);
  const yesPoolRaw = toBigInt(values[5]);
  const noPoolRaw = toBigInt(values[6]);
  const settlementPriceRaw = toBigInt(values[7]);
  const drawPoolRaw = toBigInt(values[8]);
  const sideANameRaw = toStringValue(values[9]);
  const drawNameRaw = toStringValue(values[10]);
  const sideBNameRaw = toStringValue(values[11]);
  const marketTypeRaw = toStringValue(values[12]);
  const winningOutcomeRaw = toNumberValue(values[13]);
  const resultRaw = toBoolean(values[14]);
  const yesPriceRaw = toBigInt(values[15]);

  const isSport = isSportsMarket(question, marketTypeRaw);
  const sideAName = sideANameRaw || 'YES';
  const drawName = drawNameRaw || 'Draw';
  const sideBName = sideBNameRaw || 'NO';
  const strikePrice = Number(strikePriceRaw) / 1e8;
  const endTime = Number(endTimeRaw);
  const bettingEndTime = Number(bettingEndTimeRaw);
  const sideAPool = Number(yesPoolRaw) / SKYUSD_MULTIPLIER;
  const drawPool = Number(drawPoolRaw) / SKYUSD_MULTIPLIER;
  const sideBPool = Number(noPoolRaw) / SKYUSD_MULTIPLIER;
  const totalVolume = sideAPool + drawPool + sideBPool;
  const state = computeState(resolved, bettingEndTime);

  let resolvedOutcome: string | undefined;
  if (resolved) {
    if (winningOutcomeRaw === 1) resolvedOutcome = drawName;
    else if (winningOutcomeRaw === 2) resolvedOutcome = sideBName;
    else resolvedOutcome = sideAName;

    if (!marketTypeRaw && winningOutcomeRaw === 0) {
      resolvedOutcome = resultRaw ? sideAName : sideBName;
    }
  }

  let probYes: number;
  let probDraw: number;
  let probNo: number;
  if (totalVolume > 0) {
    probYes = sideAPool / totalVolume;
    probDraw = drawPool / totalVolume;
    probNo = sideBPool / totalVolume;
  } else if (isSport) {
    probYes = 0.4;
    probDraw = 0.2;
    probNo = 0.4;
  } else {
    const yp = Number(yesPriceRaw) / 1e16;
    probYes = yp > 0 && yp <= 100 ? yp / 100 : 0.5;
    probDraw = 0;
    probNo = 1 - probYes;
  }

  const duration = inferDuration(question);

  return {
    id: address,
    contractId: address,
    title: question,
    ticker: isSport ? 'SPORT' : inferTicker(question),
    sideAName,
    drawName,
    sideBName,
    description: isSport ? 'Football match — market closes at kickoff.' : 'Resolves via median of 10 exchange prices at market close.',
    type: isSport ? 'sport' : 'crypto',
    category: isSport ? 'SPORTS' : 'CRYPTO',
    identifier: isSport ? question.replace(/\s+/g, '-').toLowerCase() : `${inferTicker(question)}USDT`,
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
    deadlinePrice: !isSport && resolved ? Number(settlementPriceRaw) / 1e8 : undefined,
    priceSymbol: isSport ? '' : '$',
    probYes,
    probDraw,
    probNo,
    percentChange: 0,
    statsLoading: false
  };
}

export function useFactoryMarkets() {
  const enabled = Boolean(FACTORY_ADDRESS && FACTORY_ADDRESS !== ZERO_FACTORY);
  const { data, isLoading, isFetching, isFetched, error, refetch } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getAllMarkets',
    query: {
      enabled,
      staleTime: 10_000,
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: 1_000
    }
  });

  return {
    addresses: (data as `0x${string}`[] | undefined) ?? [],
    isLoading,
    isFetching,
    isFetched,
    error,
    refetch
  };
}

export function useBatchedMarkets(addresses: `0x${string}`[]) {
  const contracts = useMemo(() => {
    return addresses.flatMap((address) =>
      MARKET_FIELDS.map((functionName) => ({
        address,
        abi: MARKET_ABI,
        functionName
      }))
    );
  }, [addresses]);

  const { data, isLoading, isFetching, isFetched, error, refetch } = useReadContracts({
    contracts,
    allowFailure: true,
    query: {
      enabled: addresses.length > 0,
      staleTime: 10_000,
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: 1_000
    }
  });

  const markets = useMemo(() => {
    if (!data) return [] as MarketData[];

    return addresses
      .map((address, marketIndex) => {
        const start = marketIndex * MARKET_FIELDS.length;
        const values = data
          .slice(start, start + MARKET_FIELDS.length)
          .map((entry) => (entry.status === 'success' ? entry.result : undefined));
        return buildMarketData(address, values);
      })
      .filter((market): market is MarketData => market !== null)
      .sort((a, b) => Number(a.deadline) - Number(b.deadline));
  }, [addresses, data]);

  return { markets, isLoading, isFetching, isFetched, error, refetch };
}

export interface BatchedUserPosition {
  marketAddress: `0x${string}`;
  onSideA: number;
  onDraw: number;
  onSideB: number;
  claimed: boolean;
  total: number;
}

export function useBatchedUserPositions(addresses: `0x${string}`[], user?: `0x${string}`) {
  const contracts = useMemo(() => {
    if (!user) return [];
    return addresses.map((address) => ({
      address,
      abi: MARKET_ABI,
      functionName: 'getUserPosition',
      args: [user]
    }));
  }, [addresses, user]);

  const { data, isLoading, isFetching, isFetched, error, refetch } = useReadContracts({
    contracts,
    allowFailure: true,
    query: {
      enabled: addresses.length > 0 && Boolean(user),
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: 1_000
    }
  });

  const positions = useMemo(() => {
    if (!data) return [] as BatchedUserPosition[];

    return data
      .map((entry, index) => {
        if (entry.status !== 'success' || !entry.result) return null;
        const raw = entry.result as unknown[];
        const sideA = Number(toBigInt(raw[0])) / SKYUSD_MULTIPLIER;
        const draw = raw.length >= 4 ? Number(toBigInt(raw[1])) / SKYUSD_MULTIPLIER : 0;
        const sideB = raw.length >= 4 ? Number(toBigInt(raw[2])) / SKYUSD_MULTIPLIER : Number(toBigInt(raw[1])) / SKYUSD_MULTIPLIER;
        const claimed = raw.length >= 4 ? toBoolean(raw[3]) : toBoolean(raw[2]);
        const total = sideA + draw + sideB;
        if (total <= 0) return null;

        return {
          marketAddress: addresses[index],
          onSideA: sideA,
          onDraw: draw,
          onSideB: sideB,
          claimed,
          total
        };
      })
      .filter((position): position is BatchedUserPosition => position !== null);
  }, [addresses, data]);

  return { positions, isLoading, isFetching, isFetched, error, refetch };
}
