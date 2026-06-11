/**
 * auto-market.ts (Ritual Network / Crypto + Football Sports)
 * ----------------------------------------------------------
 * - Crypto: keeps hourly/daily markets using median exchange prices.
 * - Sports: creates football 3-way markets 5 days before kickoff, closes at kickoff,
 *   resolves from free football-data.org scores after full time.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import ccxt from 'ccxt';

const RPC_URL = process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as string;
const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const SPORTS_STATE_FILE = path.join(__dirname, 'sports-markets.json');

if (!PRIVATE_KEY || !FACTORY_ADDRESS) {
  console.error('Missing required env vars: PRIVATE_KEY / FACTORY_ADDRESS');
  process.exit(1);
}

const FACTORY_ABI = [
  'function createMarket(string memory question, uint256 strikePrice, uint256 endTime, uint256 bettingEndTime) external returns (address)',
  'function createMarketWithOutcomes(string memory question,string memory sideAName,string memory drawName,string memory sideBName,string memory marketType,uint256 strikePrice,uint256 endTime,uint256 bettingEndTime) external returns (address)',
  'function getAllMarkets() external view returns (address[])',
  'function getMarkets(uint256 offset,uint256 limit) external view returns (address[])',
  'function marketCount() external view returns (uint256)'
];

const MARKET_ABI = [
  'function endTime() external view returns (uint256)',
  'function bettingEndTime() external view returns (uint256)',
  'function resolved() external view returns (bool)',
  'function resolveWithCustomPrice(uint256 price) external',
  'function resolveWithOutcome(uint8 outcome,uint256 settlementValue) external',
  'function question() external view returns (string)',
  'function marketType() external view returns (string)',
  'function sideAName() external view returns (string)',
  'function drawName() external view returns (string)',
  'function sideBName() external view returns (string)',
  'function strikePrice() external view returns (uint256)'
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

provider.getNetwork().then(network => {
  console.log(`[DIAGNOSTICS] Ritual RPC: ${RPC_URL} | Chain ID: ${network.chainId} | Signer: ${signer.address}`);
}).catch(err => console.error('[DIAGNOSTICS] Failed to get network:', err.message));

async function buildManualTx(to: string, data: string, gasLimit: bigint, value?: bigint): Promise<ethers.TransactionRequest> {
  const tx: ethers.TransactionRequest = {
    to,
    data,
    gasLimit,
    // Ritual RPC can return an invalid/overflowing gas estimate via feeData.
    // Use a deterministic legacy gas price for scheduler txs instead.
    gasPrice: ethers.parseUnits(process.env.RITUAL_GAS_PRICE_GWEI || '0.02', 'gwei')
  };
  if (value !== undefined) tx.value = value;
  return tx;
}

async function sendResolveTx(market: ethers.Contract, price: bigint) {
  const data = market.interface.encodeFunctionData('resolveWithCustomPrice', [price]);
  const tx = await signer.sendTransaction(await buildManualTx(String(market.target), data, 400_000n));
  await tx.wait();
}

async function sendResolveOutcomeTx(market: ethers.Contract, outcome: 0 | 1 | 2, settlementValue: bigint) {
  const data = market.interface.encodeFunctionData('resolveWithOutcome', [outcome, settlementValue]);
  const tx = await signer.sendTransaction(await buildManualTx(String(market.target), data, 450_000n));
  await tx.wait();
}

async function sendCreateMarketTx(factory: ethers.Contract, question: string, strike: bigint, endTime: number, bettingEndTime: number) {
  const data = factory.interface.encodeFunctionData('createMarket', [question, strike, endTime, bettingEndTime]);
  const tx = await signer.sendTransaction(await buildManualTx(String(factory.target), data, 5_000_000n));
  await tx.wait();
}

async function getFactoryMarkets(factory: ethers.Contract): Promise<string[]> {
  try {
    const countRaw = await factory.marketCount();
    const total = Number(countRaw);
    const pageSize = Number(process.env.AUTO_MARKET_PAGE_SIZE || '100');
    const pages: Promise<string[]>[] = [];
    for (let offset = 0; offset < total; offset += pageSize) {
      pages.push(factory.getMarkets(offset, pageSize));
    }
    const results = await Promise.all(pages);
    return results.flat();
  } catch {
    return (await factory.getAllMarkets()) as string[];
  }
}

async function getLatestFactoryMarket(factory: ethers.Contract): Promise<string | null> {
  try {
    const countRaw = await factory.marketCount();
    const total = Number(countRaw);
    if (total <= 0) return null;
    const page = (await factory.getMarkets(total - 1, 1)) as string[];
    return page[0] || null;
  } catch {
    const markets = (await factory.getAllMarkets()) as string[];
    return markets[markets.length - 1] || null;
  }
}

async function sendCreateSportsMarketTx(factory: ethers.Contract, fixture: TrackedFixture) {
  const question = `${fixture.homeTeam} vs ${fixture.awayTeam}`;
  const data = factory.interface.encodeFunctionData('createMarketWithOutcomes', [
    question,
    fixture.homeTeam,
    'Draw',
    fixture.awayTeam,
    'SPORTS',
    BigInt(fixture.fixtureId),
    fixture.kickoff,
    fixture.kickoff
  ]);
  const tx = await signer.sendTransaction(await buildManualTx(String(factory.target), data, 5_000_000n));
  const receipt = await tx.wait();
  console.log(`[SPORT] Created ${question} | tx=${receipt?.hash}`);
}

const EXCHANGE_IDS = ['binance', 'bybit', 'mexc', 'kucoin', 'gate', 'bitget', 'htx', 'okx', 'bitmart', 'digifinex'] as const;
const TICKERS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'] as const;
type Ticker = (typeof TICKERS)[number];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toScaledPrice(price: number): bigint {
  return BigInt(Math.floor(price * 1e8));
}

async function getLiveMedianPrice(ticker: Ticker): Promise<number> {
  const symbol = `${ticker}/USDT`;
  const results = await Promise.all(EXCHANGE_IDS.map(async (id) => {
    try {
      const ExchangeClass = (ccxt as any)[id];
      const exchange = new ExchangeClass({ timeout: 3500, enableRateLimit: true });
      const data = await exchange.fetchTicker(symbol);
      const value = Number(data?.last);
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
  }));
  const prices = results.filter((v): v is number => v !== null);
  if (!prices.length) throw new Error(`All live exchange price sources failed for ${symbol}`);
  return median(prices);
}

async function getHistoricalMedianPrice(ticker: Ticker, targetTs: number): Promise<number> {
  const symbol = `${ticker}/USDT`;
  const since = Math.max(0, (targetTs - 5 * 60) * 1000);
  const results = await Promise.all(EXCHANGE_IDS.map(async (id) => {
    try {
      const ExchangeClass = (ccxt as any)[id];
      const exchange = new ExchangeClass({ timeout: 6000, enableRateLimit: true });
      const candles: any[] = await exchange.fetchOHLCV(symbol, '1m', since, 12);
      if (!Array.isArray(candles) || candles.length === 0) return null;
      let closest: any[] | null = null;
      let minDiff = Number.MAX_SAFE_INTEGER;
      for (const candle of candles) {
        const diff = Math.abs(Math.floor(Number(candle[0]) / 1000) - targetTs);
        if (diff < minDiff) { minDiff = diff; closest = candle; }
      }
      const close = Number(closest?.[4]);
      return Number.isFinite(close) && close > 0 ? close : null;
    } catch { return null; }
  }));
  const prices = results.filter((v): v is number => v !== null);
  return prices.length ? median(prices) : getLiveMedianPrice(ticker);
}

const LOCK_FILE = path.join(__dirname, 'auto-market.lock');
function clearStaleLock() { try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch { } }
function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE);
      if (Date.now() - stats.mtimeMs < 120000) return false;
      fs.unlinkSync(LOCK_FILE);
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
  } catch { return false; }
}
function releaseLock() { try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch { } }

const formatHour = (ts: number) => `${new Date(ts * 1000).getUTCHours().toString().padStart(2, '0')}:00 UTC`;
const formatDate = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0];
function nextHourUTC() { const d = new Date(); d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0); return Math.floor(d.getTime() / 1000); }
function nextMidnightUTC() { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000); }

function inferMarketInfo(question: string): { type: 'H' | 'D' | null; ticker: Ticker | null } {
  const q = question.toLowerCase();
  let marketType: 'H' | 'D' | null = null;
  if ((q.includes(' at ') && (q.includes(':') || q.includes('utc'))) || q.includes('hour')) marketType = 'H';
  else if (q.includes('midnight') || q.includes('daily')) marketType = 'D';
  let foundTicker: Ticker | null = null;
  for (const t of TICKERS) if (q.includes(`${t.toLowerCase()}/usd`)) { foundTicker = t; break; }
  return { type: marketType, ticker: foundTicker };
}

const TOP_FIVE_TEAMS_BY_COMPETITION: Record<string, Set<string>> = {
  PL: new Set([
    'Arsenal FC',
    'Chelsea FC',
    'Liverpool FC',
    'Manchester City FC',
    'Manchester United FC'
  ]),
  PD: new Set([
    'Real Madrid CF',
    'FC Barcelona',
    'Club Atlético de Madrid',
    'Athletic Club',
    'Villarreal CF'
  ]),
  SA: new Set([
    'Juventus FC',
    'FC Internazionale Milano',
    'AC Milan',
    'SSC Napoli',
    'AS Roma'
  ]),
  BL1: new Set([
    'FC Bayern München',
    'Borussia Dortmund',
    'Bayer 04 Leverkusen',
    'RB Leipzig',
    'Eintracht Frankfurt'
  ]),
  FL1: new Set([
    'Paris Saint-Germain FC',
    'Olympique de Marseille',
    'AS Monaco FC',
    'Olympique Lyonnais',
    'LOSC Lille'
  ])
};
const DOMESTIC_COMPETITIONS = new Set(Object.keys(TOP_FIVE_TEAMS_BY_COMPETITION));
const UCL_COMPETITIONS = new Set(['CL', 'UCL', 'WC']);
const SPORTS_DISCOVERY_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SPORTS_RESOLVE_SCAN_INTERVAL_MS = 10 * 60 * 1000;
const CRYPTO_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSportsDiscoveryAt = 0;
let cachedSportsFixtures: TrackedFixture[] = [];

interface TrackedFixture {
  fixtureId: number;
  marketAddress?: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: number;
  status?: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  createdAt?: string;
  resolvedAt?: string;
  nextCheckAt?: number;
}

type SportsState = Record<string, TrackedFixture>;
function readSportsState(): SportsState {
  try { return JSON.parse(fs.readFileSync(SPORTS_STATE_FILE, 'utf8')); } catch { return {}; }
}
function writeSportsState(state: SportsState) { fs.writeFileSync(SPORTS_STATE_FILE, JSON.stringify(state, null, 2)); }

async function footballApi(pathname: string): Promise<any | null> {
  if (!FOOTBALL_API_KEY) {
    console.warn('[SPORT] FOOTBALL_DATA_API_KEY not set; sports automation is enabled but API calls are skipped.');
    return null;
  }
  const response = await fetch(`https://api.football-data.org/v4${pathname}`, { headers: { 'X-Auth-Token': FOOTBALL_API_KEY } });
  if (!response.ok) {
    console.warn(`[SPORT] API ${pathname} failed: ${response.status} ${response.statusText}`);
    return null;
  }
  return response.json();
}

function dateOnly(ts: number) { return new Date(ts * 1000).toISOString().slice(0, 10); }
function nextSportsDiscoveryDue() { return lastSportsDiscoveryAt + SPORTS_DISCOVERY_INTERVAL_MS; }

function shouldCreateSportsMarket(match: any): boolean {
  const comp = String(match.competition?.code || match.competition?.id || '').toUpperCase();
  const home = match.homeTeam?.name;
  const away = match.awayTeam?.name;
  if (!home || !away) return false;

  if (UCL_COMPETITIONS.has(comp)) return true;
  if (!DOMESTIC_COMPETITIONS.has(comp)) return false;

  const allowedTeams = TOP_FIVE_TEAMS_BY_COMPETITION[comp];
  return allowedTeams.has(home) || allowedTeams.has(away);
}

async function fetchUpcomingBigFixtures(force = false): Promise<TrackedFixture[]> {
  const nowMs = Date.now();
  if (!force && cachedSportsFixtures.length && nowMs < nextSportsDiscoveryDue()) {
    return cachedSportsFixtures;
  }

  const now = Math.floor(nowMs / 1000);
  const from = dateOnly(now);
  const to = dateOnly(now + 5 * 24 * 60 * 60);
  const data = await footballApi(`/matches?dateFrom=${from}&dateTo=${to}`);
  const matches = data?.matches || [];
  const fixtures: TrackedFixture[] = [];
  const seenFixtureIds = new Set<number>();

  for (const match of matches) {
    const home = match.homeTeam?.name;
    const away = match.awayTeam?.name;
    const kickoff = Math.floor(Date.parse(match.utcDate) / 1000);
    const fixtureId = Number(match.id);
    const competition = String(match.competition?.code || match.competition?.id || 'FOOTBALL').toUpperCase();
    if (!fixtureId || seenFixtureIds.has(fixtureId) || !home || !away || !kickoff) continue;
    if (!shouldCreateSportsMarket(match)) continue;
    if (kickoff - now <= 0 || kickoff - now > 5 * 24 * 60 * 60) continue;

    seenFixtureIds.add(fixtureId);
    fixtures.push({ fixtureId, competition, homeTeam: home, awayTeam: away, kickoff, status: match.status });
  }

  lastSportsDiscoveryAt = nowMs;
  cachedSportsFixtures = fixtures;
  console.log(`[SPORT] Discovery found ${fixtures.length} eligible fixture(s) from ${from} to ${to}. Discovery cache refreshed for 12h.`);
  return fixtures;
}

async function fetchMatchResult(fixture: TrackedFixture): Promise<{ status: string; homeGoals: number | null; awayGoals: number | null } | null> {
  const matchDate = dateOnly(fixture.kickoff);
  const endDate = dateOnly(fixture.kickoff + 86400); // add 24 hours to dateTo for safety
  const data = await footballApi(`/matches?dateFrom=${matchDate}&dateTo=${endDate}`);
  if (!data) return null; // Handle API failure gracefully
  const match = (data.matches || []).find((item: any) => Number(item.id) === fixture.fixtureId);
  if (!match) return null;
  return {
    status: match.status,
    homeGoals: match.score?.fullTime?.home ?? null,
    awayGoals: match.score?.fullTime?.away ?? null
  };
}

function normalizeQuestion(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function findFixtureByTeams(homeTeam: string, awayTeam: string, kickoff: number): Promise<TrackedFixture | null> {
  const from = dateOnly(kickoff - 86400);
  const to = dateOnly(kickoff + 86400);
  const data = await footballApi(`/matches?dateFrom=${from}&dateTo=${to}`);
  const matches = data?.matches || [];
  const homeNorm = normalizeQuestion(homeTeam);
  const awayNorm = normalizeQuestion(awayTeam);

  const match = matches.find((item: any) => {
    const itemHome = normalizeQuestion(String(item.homeTeam?.name || ''));
    const itemAway = normalizeQuestion(String(item.awayTeam?.name || ''));
    const itemKickoff = Math.floor(Date.parse(item.utcDate) / 1000);
    return itemHome === homeNorm && itemAway === awayNorm && Math.abs(itemKickoff - kickoff) <= 6 * 60 * 60;
  });

  if (!match) return null;
  return {
    fixtureId: Number(match.id),
    competition: String(match.competition?.code || match.competition?.id || 'FOOTBALL').toUpperCase(),
    homeTeam: match.homeTeam?.name || homeTeam,
    awayTeam: match.awayTeam?.name || awayTeam,
    kickoff: Math.floor(Date.parse(match.utcDate) / 1000),
    status: match.status
  };
}

async function syncExistingSportsMarkets(state: SportsState, allMarkets: string[]) {
  const stateByAddress = new Map(
    Object.entries(state)
      .filter(([, tracked]) => tracked.marketAddress)
      .map(([key, tracked]) => [tracked.marketAddress!.toLowerCase(), key])
  );

  for (const addr of allMarkets.slice(-1000)) {
    try {
      const market = new ethers.Contract(addr, MARKET_ABI, provider);
      const [typeRaw, resolved, question, endTimeRaw] = await Promise.all([
        market.marketType().catch(() => 'CRYPTO'),
        market.resolved(),
        market.question(),
        market.endTime()
      ]);

      if (String(typeRaw).toUpperCase() !== 'SPORTS') continue;

      const existingKey = stateByAddress.get(addr.toLowerCase());
      if (resolved) {
        if (existingKey) {
          console.log(`[SPORT] ${question} is already resolved on-chain, removing from database...`);
          delete state[existingKey];
          stateByAddress.delete(addr.toLowerCase());
        }
        continue;
      }

      if (existingKey) continue;

      const [sideA, sideB, strikePriceRaw] = await Promise.all([
        market.sideAName().catch(() => ''),
        market.sideBName().catch(() => ''),
        market.strikePrice().catch(() => 0n)
      ]);
      const kickoff = Number(endTimeRaw);
      const fixtureFromApi = sideA && sideB ? await findFixtureByTeams(String(sideA), String(sideB), kickoff) : null;
      const fixtureId = fixtureFromApi?.fixtureId || Number(strikePriceRaw);

      if (!fixtureId) {
        console.warn(`[SPORT] Cannot backfill ${question}; fixture id is missing.`);
        continue;
      }

      const key = String(fixtureId);
      if (state[key]?.marketAddress) continue;

      state[key] = {
        fixtureId,
        competition: fixtureFromApi?.competition || 'FOOTBALL',
        homeTeam: fixtureFromApi?.homeTeam || String(sideA),
        awayTeam: fixtureFromApi?.awayTeam || String(sideB),
        kickoff: fixtureFromApi?.kickoff || kickoff,
        status: fixtureFromApi?.status || 'SCHEDULED',
        marketAddress: addr,
        createdAt: state[key]?.createdAt || new Date().toISOString()
      };
      stateByAddress.set(addr.toLowerCase(), key);
      console.log(`[SPORT] Backfilled existing market into database: ${question} -> ${addr}`);
    } catch (err: any) {
      console.warn(`[SPORT] Failed to inspect market ${addr}:`, err?.shortMessage || err?.message || err);
    }
  }
}


async function runSportsAutomation(factory: ethers.Contract, allMarkets: string[]) {
  const state = readSportsState();
  const fixtures = await fetchUpcomingBigFixtures();
  const currentMarketSet = new Set(allMarkets.map((addr) => addr.toLowerCase()));
  for (const [key, tracked] of Object.entries(state)) {
    if (tracked.marketAddress && !currentMarketSet.has(tracked.marketAddress.toLowerCase())) {
      console.warn(`[SPORT] Stale market ${tracked.marketAddress} for fixture ${key}; current factory changed, recreating.`);
      delete state[key];
    }
  }

  await syncExistingSportsMarkets(state, allMarkets);
  writeSportsState(state);

  const existingQuestions = new Map<string, string>();
  for (const addr of allMarkets.slice(-1000)) {
    try {
      const m = new ethers.Contract(addr, MARKET_ABI, provider);
      const [question, type, resolved] = await Promise.all([
        m.question(),
        m.marketType().catch(() => 'CRYPTO'),
        m.resolved()
      ]);
      if (String(type).toUpperCase() === 'SPORTS' && !resolved) {
        existingQuestions.set(normalizeQuestion(String(question)), addr);
      }
    } catch { }
  }

  for (const fixture of fixtures) {
    const key = String(fixture.fixtureId);
    const question = `${fixture.homeTeam} vs ${fixture.awayTeam}`;
    const existingAddress = existingQuestions.get(normalizeQuestion(question));
    if (state[key]?.marketAddress) continue;
    if (existingAddress) {
      state[key] = { ...fixture, marketAddress: existingAddress, createdAt: new Date().toISOString() };
      console.log(`[SPORT] Linked existing market to database: ${question} -> ${existingAddress}`);
      writeSportsState(state);
      continue;
    }
    await sendCreateSportsMarketTx(factory, fixture);
    const latestMarket = await getLatestFactoryMarket(factory);
    if (!latestMarket) throw new Error(`Could not read newly created market for fixture ${fixture.fixtureId}`);
    state[key] = { ...fixture, marketAddress: latestMarket, createdAt: new Date().toISOString() };
    writeSportsState(state);
  }

  for (const [key, tracked] of Object.entries(state)) {
    if (!tracked.marketAddress || tracked.resolvedAt) continue;
    const now = Math.floor(Date.now() / 1000);
    
    // First check is 115 minutes after kickoff. If the match is not FT yet,
    // retry every 10 minutes until football-data.org returns FINISHED.
    const checkTime = tracked.nextCheckAt || (tracked.kickoff + 115 * 60);
    if (now < checkTime) continue;

    console.log(`[SPORT] Checking status for ${tracked.homeTeam} vs ${tracked.awayTeam} (kickoff +115m, then 10m retries until FT)...`);
    const result = await fetchMatchResult(tracked);
    
    if (!result) {
      console.warn(`[SPORT] API failed or match not found for ${tracked.homeTeam}. Will retry in 10 minutes.`);
      state[key] = { ...tracked, nextCheckAt: now + 10 * 60 };
      writeSportsState(state);
      continue;
    }

    if (result.status !== 'FINISHED') {
      console.log(`[SPORT] Match ${tracked.homeTeam} vs ${tracked.awayTeam} still ${result.status}. Will retry in 10 minutes.`);
      state[key] = { ...tracked, status: result.status, nextCheckAt: now + 10 * 60 };
      writeSportsState(state);
      continue;
    }

    if (result.homeGoals === null || result.awayGoals === null) {
      console.warn(`[SPORT] Match FINISHED but goals are null for ${tracked.homeTeam}. Will retry in 10 minutes.`);
      state[key] = { ...tracked, nextCheckAt: now + 10 * 60 };
      writeSportsState(state);
      continue;
    }

    const outcome: 0 | 1 | 2 = result.homeGoals > result.awayGoals ? 0 : result.homeGoals === result.awayGoals ? 1 : 2;
    
    try {
      const market = new ethers.Contract(tracked.marketAddress, MARKET_ABI, signer);
      if (await market.resolved()) {
        console.log(`[SPORT] Market already resolved, removing from database...`);
        delete state[key];
        writeSportsState(state);
        continue;
      }

      console.log(`[SPORT] Resolve ${tracked.homeTeam} ${result.homeGoals}-${result.awayGoals} ${tracked.awayTeam}`);
      await sendResolveOutcomeTx(market, outcome, BigInt(`${result.homeGoals}${result.awayGoals}`));
      
      console.log(`[SPORT] Market resolved successfully, removing from database...`);
      delete state[key];
      writeSportsState(state);
    } catch (err: any) {
      console.error(`[SPORT] Error resolving market ${tracked.marketAddress}:`, err?.shortMessage || err?.message || err);
    }
  }
}

async function resolveMarkets() {
  if (!acquireLock()) { console.log('Another sweep is running, skipping...'); return; }

  try {
    const balance = await provider.getBalance(signer.address);
    console.log(`\n[SWEEP] Balance: ${ethers.formatEther(balance)} RITUAL | ${new Date().toISOString()}`);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    const allMarkets = await getFactoryMarkets(factory);
    const recent = allMarkets.slice(-500);
    const now = Math.floor(Date.now() / 1000);

    const activeEndTimes: Record<Ticker, Record<'H' | 'D', Set<number>>> = {} as any;
    TICKERS.forEach(t => { activeEndTimes[t] = { H: new Set(), D: new Set() }; });

    for (const addr of recent) {
      try {
        const market = new ethers.Contract(addr, MARKET_ABI, signer);
        const [endTimeRaw, resolved, question, type] = await Promise.all([market.endTime(), market.resolved(), market.question(), market.marketType().catch(() => 'CRYPTO')]);
        if (String(type).toUpperCase() === 'SPORTS') continue;
        const endTime = Number(endTimeRaw);
        const { type: marketType, ticker } = inferMarketInfo(question);
        if (!resolved) {
          if (now >= endTime) {
            if (ticker) {
              const histPrice = await getHistoricalMedianPrice(ticker, endTime);
              console.log(`Resolve: ${question} @ $${histPrice.toFixed(4)}`);
              await sendResolveTx(market, toScaledPrice(histPrice));
            }
          } else if (marketType && ticker) {
            activeEndTimes[ticker][marketType].add(endTime);
          }
        }
      } catch (e: any) {
        console.error(`Market process error ${addr}:`, e?.shortMessage || e?.message || e);
      }
    }

    // Crypto markets are daily-only. Every sweep resolves expired daily markets first;
    // once a daily market is resolved and no active market exists for the next
    // midnight window, the scheduler deploys a fresh daily market.
    const types = [
      { id: 'D' as const, label: 'Daily', getET: nextMidnightUTC, buffer: 3 * 60 * 60 }
    ];

    for (const ticker of TICKERS) {
      for (const t of types) {
        const targetET = t.getET();
        if (activeEndTimes[ticker][t.id].has(targetET)) continue;
        try {
          const liveMedian = await getLiveMedianPrice(ticker);
          const formattedPrice = liveMedian.toLocaleString('en-US', { minimumFractionDigits: liveMedian < 1 ? 4 : 2, maximumFractionDigits: liveMedian < 1 ? 4 : 2 });
          const question = `Will ${ticker}/USD be above $${formattedPrice} by midnight ${formatDate(targetET)}?`;
          console.log(`Create ${ticker} ${t.label}: ${question}`);
          await sendCreateMarketTx(factory, question, toScaledPrice(liveMedian), targetET, targetET - t.buffer);
        } catch (e: any) {
          console.error(`${ticker} ${t.label} create failed:`, e?.shortMessage || e?.message || e);
        }
      }
    }

    await runSportsAutomation(factory, allMarkets);
  } catch (err: any) {
    console.error('Sweep failure:', err?.shortMessage || err?.message || err);
  } finally {
    releaseLock();
  }
}

async function main() {
  console.log('Sky Predict Bot Starting on Ritual (Daily Crypto + Sports Football)...');
  clearStaleLock();
  await resolveMarkets();
  setInterval(resolveMarkets, CRYPTO_SWEEP_INTERVAL_MS);
}

main().catch(console.error);
