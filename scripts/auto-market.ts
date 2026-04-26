/**
 * auto-market.ts (Seismic Testnet / 10-Market Median)
 * ----------------------------------------------------
 * - Resolve directly on Seismic Testnet with resolveWithCustomPrice()
 * - Price source: median of 10 exchanges (live + historical)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import ccxt from 'ccxt';

const RPC_URL =
  process.env.SEISMIC_RPC_URL ||
  process.env.BASE_SEPOLIA_RPC_URL ||
  'https://gcp-1.seismictest.net/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const FACTORY_ADDRESS =
  (process.env.FACTORY_ADDRESS ||
    process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    process.env.NEXT_PUBLIC_BET_FACTORY_ADDRESS) as string;

if (!PRIVATE_KEY || !FACTORY_ADDRESS) {
  console.error('Missing required env vars: PRIVATE_KEY / FACTORY_ADDRESS');
  process.exit(1);
}

const FACTORY_ABI = [
  'function createMarket(string memory question, uint256 strikePrice, uint256 endTime, uint256 bettingEndTime) external returns (address)',
  'function getAllMarkets() external view returns (address[])'
];

const MARKET_ABI = [
  'function endTime() external view returns (uint256)',
  'function bettingEndTime() external view returns (uint256)',
  'function resolved() external view returns (bool)',
  'function resolveWithCustomPrice(uint256 price) external',
  'function question() external view returns (string)'
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// Diagnostic log
provider.getNetwork().then(network => {
  console.log(`[DIAGNOSTICS] Connected to RPC: ${RPC_URL} | Chain ID: ${network.chainId} | Signer: ${signer.address}`);
}).catch(err => console.error("[DIAGNOSTICS] Failed to get network:", err.message));

async function buildManualTx(
  to: string,
  data: string,
  gasLimit: bigint,
  value?: bigint
): Promise<ethers.TransactionRequest> {
  const feeData = await provider.getFeeData();
  const tx: ethers.TransactionRequest = { to, data, gasLimit };
  if (value !== undefined) tx.value = value;

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    tx.maxFeePerGas = feeData.maxFeePerGas;
    tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData.gasPrice) {
    tx.gasPrice = feeData.gasPrice;
  }

  return tx;
}

async function sendResolveTx(market: ethers.Contract, price: bigint) {
  const data = market.interface.encodeFunctionData('resolveWithCustomPrice', [price]);
  const txReq = await buildManualTx(String(market.target), data, 400_000n);
  const tx = await signer.sendTransaction(txReq);
  await tx.wait();
}

async function sendCreateMarketTx(
  factory: ethers.Contract,
  question: string,
  strike: bigint,
  endTime: number,
  bettingEndTime: number
) {
  const data = factory.interface.encodeFunctionData('createMarket', [
    question,
    strike,
    endTime,
    bettingEndTime
  ]);
  // Seismic RPC currently fails on eth_estimateGas for onlyOwner paths.
  // Use fixed limit to bypass estimator while preserving valid signer ownership.
  const txReq = await buildManualTx(String(factory.target), data, 2_500_000n);
  const tx = await signer.sendTransaction(txReq);
  await tx.wait();
}

const EXCHANGE_IDS = [
  'binance',
  'bybit',
  'mexc',
  'kucoin',
  'gate',
  'bitget',
  'htx',
  'okx',
  'bitmart',
  'digifinex'
] as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toScaledPrice(price: number): bigint {
  return BigInt(Math.floor(price * 1e8));
}

const TICKERS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'] as const;
type Ticker = (typeof TICKERS)[number];

async function getLiveMedianPrice(ticker: Ticker): Promise<number> {
  const symbol = `${ticker}/USDT`;
  const results = await Promise.all(
    EXCHANGE_IDS.map(async (id) => {
      try {
        const ExchangeClass = (ccxt as any)[id];
        const exchange = new ExchangeClass({ timeout: 3500, enableRateLimit: true });
        const data = await exchange.fetchTicker(symbol);
        const value = Number(data?.last);
        return Number.isFinite(value) && value > 0 ? value : null;
      } catch {
        return null;
      }
    })
  );

  const prices = results.filter((v): v is number => v !== null);
  if (!prices.length) throw new Error(`All live exchange price sources failed for ${symbol}`);
  return median(prices);
}

async function getHistoricalMedianPrice(ticker: Ticker, targetTs: number): Promise<number> {
  const symbol = `${ticker}/USDT`;
  const since = Math.max(0, (targetTs - 5 * 60) * 1000);

  const results = await Promise.all(
    EXCHANGE_IDS.map(async (id) => {
      try {
        const ExchangeClass = (ccxt as any)[id];
        const exchange = new ExchangeClass({ timeout: 6000, enableRateLimit: true });
        const candles: any[] = await exchange.fetchOHLCV(symbol, '1m', since, 12);
        if (!Array.isArray(candles) || candles.length === 0) return null;

        let closest: any[] | null = null;
        let minDiff = Number.MAX_SAFE_INTEGER;

        for (const candle of candles) {
          const candleTs = Math.floor(Number(candle[0]) / 1000);
          const diff = Math.abs(candleTs - targetTs);
          if (diff < minDiff) {
            minDiff = diff;
            closest = candle;
          }
        }

        if (!closest) return null;
        const close = Number(closest[4]);
        return Number.isFinite(close) && close > 0 ? close : null;
      } catch {
        return null;
      }
    })
  );

  const prices = results.filter((v): v is number => v !== null);
  if (!prices.length) {
    console.warn(`Historical sources empty for ${symbol}, falling back to live median`);
    return getLiveMedianPrice(ticker);
  }
  return median(prices);
}

const LOCK_FILE = path.join(__dirname, 'auto-market.lock');

function clearStaleLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE);
      if (Date.now() - stats.mtimeMs < 120000) return false;
      fs.unlinkSync(LOCK_FILE);
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

const formatHour = (ts: number) => `${new Date(ts * 1000).getUTCHours().toString().padStart(2, '0')}:00 UTC`;
const formatDate = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0];

function nextHourUTC() {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function nextMidnightUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function inferMarketInfo(question: string): { type: 'H' | 'D' | null; ticker: Ticker | null } {
  const q = question.toLowerCase();
  let marketType: 'H' | 'D' | null = null;
  if ((q.includes(' at ') && (q.includes(':') || q.includes('utc'))) || q.includes('hour')) marketType = 'H';
  else if (q.includes('midnight') || q.includes('daily')) marketType = 'D';

  let foundTicker: Ticker | null = null;
  for (const t of TICKERS) {
    if (q.includes(`${t.toLowerCase()}/usd`)) {
      foundTicker = t;
      break;
    }
  }

  return { type: marketType, ticker: foundTicker };
}

async function resolveMarkets() {
  if (!acquireLock()) {
    console.log('Another sweep is running, skipping...');
    return;
  }

  try {
    const balance = await provider.getBalance(signer.address);
    console.log(`\n[SWEEP] Balance: ${ethers.formatEther(balance)} ETH | ${new Date().toISOString()}`);

    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    const allMarkets = (await factory.getAllMarkets()) as string[];
    const recent = allMarkets.slice(-500);
    const now = Math.floor(Date.now() / 1000);

    const activeEndTimes: Record<Ticker, Record<'H' | 'D', Set<number>>> = {} as any;
    TICKERS.forEach(t => { activeEndTimes[t] = { H: new Set(), D: new Set() }; });

    for (const addr of recent) {
      try {
        const market = new ethers.Contract(addr, MARKET_ABI, signer);
        const [endTimeRaw, resolved, question] = await Promise.all([
          market.endTime(),
          market.resolved(),
          market.question()
        ]);

        const endTime = Number(endTimeRaw);
        const { type: marketType, ticker } = inferMarketInfo(question);

        if (!resolved) {
          if (now >= endTime) {
            if (ticker) {
              const histPrice = await getHistoricalMedianPrice(ticker, endTime);
              const scaled = toScaledPrice(histPrice);
              console.log(`Resolve: ${question} @ $${histPrice.toFixed(4)}`);
              await sendResolveTx(market, scaled);
            } else {
              console.warn(`Unknown ticker for market: ${question}`);
            }
          } else if (marketType && ticker) {
            activeEndTimes[ticker][marketType].add(endTime);
          }
        }
      } catch (e: any) {
        console.error(`Market process error ${addr}:`, e?.shortMessage || e?.message || e);
      }
    }

    const types = [
      { id: 'H' as const, label: 'Hourly', getET: nextHourUTC, buffer: 600 },
      { id: 'D' as const, label: 'Daily', getET: nextMidnightUTC, buffer: 18000 }
    ];

    for (const ticker of TICKERS) {
      for (const t of types) {
        const targetET = t.getET();
        if (activeEndTimes[ticker][t.id].has(targetET)) continue;

        try {
          const liveMedian = await getLiveMedianPrice(ticker);
          const strike = toScaledPrice(liveMedian);
          const formattedPrice = liveMedian.toLocaleString('en-US', { 
            minimumFractionDigits: liveMedian < 1 ? 4 : 2, 
            maximumFractionDigits: liveMedian < 1 ? 4 : 2 
          });

          const question =
            t.id === 'H'
              ? `Will ${ticker}/USD be above $${formattedPrice} at ${formatHour(targetET)}?`
              : `Will ${ticker}/USD be above $${formattedPrice} by midnight ${formatDate(targetET)}?`;

          // Check for conflicts
          const freshAll = (await factory.getAllMarkets()) as string[];
          const freshRecent = freshAll.slice(-300);
          let conflict = false;

          for (const addr of freshRecent) {
            try {
              const m2 = new ethers.Contract(addr, MARKET_ABI, provider);
              const [freshET, isResolved, q] = await Promise.all([m2.endTime(), m2.resolved(), m2.question()]);
              if (!isResolved && Number(freshET) === targetET && q.includes(`${ticker}/USD`)) {
                conflict = true;
                break;
              }
            } catch { }
          }

          if (conflict) {
            console.log(`Skip ${ticker} ${t.label}: race conflict for ${targetET}`);
            continue;
          }

          console.log(`Create ${ticker} ${t.label}: ${question}`);
          await sendCreateMarketTx(factory, question, strike, targetET, targetET - t.buffer);
        } catch (e: any) {
          console.error(`${ticker} ${t.label} create failed:`, e?.shortMessage || e?.message || e);
        }
      }
    }
  } catch (err: any) {
    console.error('Sweep failure:', err?.shortMessage || err?.message || err);
  } finally {
    releaseLock();
  }
}

async function main() {
  console.log('Sky Predict Bot Starting (Multi-Asset: BTC, ETH, SOL, XRP, DOGE, BNB)...');
  clearStaleLock();
  await resolveMarkets();
  setInterval(resolveMarkets, 60_000);
}

main().catch(console.error);

