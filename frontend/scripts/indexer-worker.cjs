 
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { createPublicClient, http, parseAbiItem } = require('viem');

loadEnv(path.join(__dirname, '..', '.env.local'));
loadEnv(path.join(__dirname, '..', '..', '.env'));

const FactoryArtifact = require('../src/lib/contracts/MarketFactory.json');
const MarketArtifact = require('../src/lib/contracts/PredictionMarket.json');

const OptimizedFactoryAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'offset', type: 'uint256' },
      { internalType: 'uint256', name: 'limit', type: 'uint256' },
    ],
    name: 'getMarkets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'isMarket',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];
const FactoryAbi = [...FactoryArtifact.abi, ...OptimizedFactoryAbi];

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0xc62d05bd0E86bc18cA9ea97996e1489293eB6F14';
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_SKYUSD_ADDRESS;
const ROUTER_ADDRESS = process.env.NEXT_PUBLIC_ROUTER_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const START_BLOCK = BigInt(process.env.INDEXER_START_BLOCK || '1');
const CHUNK_SIZE = BigInt(process.env.INDEXER_CHUNK_SIZE || '100000');
const BLOCKS_PER_TICK = BigInt(process.env.INDEXER_BLOCKS_PER_TICK || '1000000');
const LOOP_INTERVAL_MS = Number(process.env.INDEXER_LOOP_INTERVAL_MS || '60000');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STATE_ID = 'main';
const MARKET_FIELDS = [
  'question', 'strikePrice', 'endTime', 'bettingEndTime', 'resolved', 'yesPool', 'noPool',
  'settlementPrice', 'drawPool', 'sideAName', 'drawName', 'sideBName', 'marketType',
  'winningOutcome', 'result', 'yesPrice'
];
const args = new Set(process.argv.slice(2));
const once = args.has('--once');
const reset = args.has('--reset');
const fromArg = process.argv.find((arg) => arg.startsWith('--from='));
const explicitFromBlock = fromArg ? BigInt(fromArg.split('=')[1]) : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!TOKEN_ADDRESS) {
  throw new Error('Missing NEXT_PUBLIC_TOKEN_ADDRESS / NEXT_PUBLIC_SKYUSD_ADDRESS');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = createPublicClient({ transport: http(RPC_URL) });
const TransferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const BetRoutedEvent = parseAbiItem('event BetRouted(address indexed user, address indexed market, uint8 outcome, uint256 amount)');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalize(address) {
  return String(address).toLowerCase();
}

function getUser(map, address) {
  const key = normalize(address);
  if (!map.has(key)) {
    map.set(key, {
      address: key,
      volume: 0n,
      payout: 0n,
      positionValue: 0n,
      sideA: 0,
      draw: 0,
      sideB: 0,
      trades: 0,
      markets: new Set(),
      positions: new Map(),
      activities: [],
      marketResults: new Map(),
    });
  }
  return map.get(key);
}

async function getState() {
  const { data, error } = await supabase
    .from('indexer_state')
    .select('last_processed_block')
    .eq('id', STATE_ID)
    .maybeSingle();
  if (error) throw error;
  return data?.last_processed_block ? BigInt(String(data.last_processed_block)) : 0n;
}

async function resetTables() {
  console.log('[indexer] resetting leaderboard/indexer tables');
  await supabase.from('user_activities').delete().neq('tx_hash', '');
  await supabase.from('user_portfolios').delete().neq('user_address', '');
  await supabase.from('leaderboard').delete().neq('user_address', '');
  await supabase.from('indexer_state').upsert({ id: STATE_ID, last_processed_block: '0', updated_at: new Date().toISOString() });
}

async function readExistingUsers() {
  const users = new Map();
  const indexedActivityKeys = new Set();
  const txMarketKeys = new Set();

  const { data: leaderboardRows, error: lbError } = await supabase
    .from('leaderboard')
    .select('user_address, volume, payout, side_a_bets, draw_bets, side_b_bets, total_bets');
  if (lbError) throw lbError;
  for (const row of leaderboardRows || []) {
    const user = getUser(users, row.user_address);
    user.volume = BigInt(String(row.volume || '0'));
    user.positionValue = BigInt(String(row.payout || '0'));
    user.sideA = Number(row.side_a_bets || 0);
    user.draw = Number(row.draw_bets || 0);
    user.sideB = Number(row.side_b_bets || 0);
    user.trades = Number(row.total_bets || 0);
  }

  const { data: portfolioRows, error: pfError } = await supabase
    .from('user_portfolios')
    .select('user_address, market_address, side_a_amount, draw_amount, side_b_amount, volume, payout, pnl, claimed');
  if (pfError) throw pfError;
  for (const row of portfolioRows || []) {
    const user = getUser(users, row.user_address);
    const market = normalize(row.market_address);
    user.markets.add(market);
    user.positions.set(market, {
      sideA: BigInt(String(row.side_a_amount || '0')),
      draw: BigInt(String(row.draw_amount || '0')),
      sideB: BigInt(String(row.side_b_amount || '0')),
      volume: BigInt(String(row.volume || '0')),
      payout: BigInt(String(row.payout || '0')),
      pnl: BigInt(String(row.pnl || '0')),
      claimed: Boolean(row.claimed),
    });
  }

  const { data: activityRows, error: activityError } = await supabase
    .from('user_activities')
    .select('tx_hash, log_index, market_address, user_address, type, outcome, amount, block_number, timestamp, status, resolved_outcome, payout, claimed');
  if (activityError) throw activityError;
  for (const row of activityRows || []) {
    indexedActivityKeys.add(`${row.tx_hash}:${row.log_index}`);
    txMarketKeys.add(`${row.tx_hash}:${normalize(row.market_address)}`);
    const user = getUser(users, row.user_address);
    user.activities.push({
      tx_hash: row.tx_hash,
      log_index: row.log_index,
      user_address: user.address,
      market_address: normalize(row.market_address),
      type: row.type,
      outcome: row.outcome === null || row.outcome === undefined ? null : Number(row.outcome),
      amount: String(row.amount || '0'),
      block_number: String(row.block_number || '0'),
      timestamp: Number(row.timestamp || 0),
      status: row.status || 'RUNNING',
      resolved_outcome: row.resolved_outcome === null || row.resolved_outcome === undefined ? null : Number(row.resolved_outcome),
      payout: String(row.payout || '0'),
      claimed: Boolean(row.claimed),
    });
  }

  return { users, indexedActivityKeys, txMarketKeys };
}

async function getMarkets() {
  const count = await client.readContract({
    address: FACTORY_ADDRESS,
    abi: FactoryAbi,
    functionName: 'marketCount',
  }).catch(() => null);

  if (count !== null && count !== undefined) {
    const total = Number(count);
    const pageSize = Number(process.env.INDEXER_MARKET_PAGE_SIZE || '100');
    const pages = [];
    for (let offset = 0; offset < total; offset += pageSize) {
      pages.push(client.readContract({
        address: FACTORY_ADDRESS,
        abi: FactoryAbi,
        functionName: 'getMarkets',
        args: [BigInt(offset), BigInt(pageSize)],
      }));
    }
    const results = await Promise.all(pages);
    return results.flat().map((market) => market.toLowerCase());
  }

  const markets = await client.readContract({
    address: FACTORY_ADDRESS,
    abi: FactoryAbi,
    functionName: 'getAllMarkets',
  });
  return [...markets].map((market) => market.toLowerCase());
}

function computeMarketState(resolved, bettingEndTime) {
  if (resolved) return 'RESOLVED';
  return Math.floor(Date.now() / 1000) < bettingEndTime ? 'ACTIVE' : 'RESOLVING';
}

function inferDuration(question) {
  const q = question.toLowerCase();
  if (q.includes('midnight') || q.includes('daily')) return 24 * 60 * 60;
  if (q.includes(' vs ')) return 5 * 24 * 60 * 60;
  return 60 * 60;
}

function inferTicker(question) {
  const tickers = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'];
  const q = question.toUpperCase();
  return tickers.find((ticker) => q.includes(`${ticker}/USD`) || q.includes(ticker)) || 'BTC';
}

function detectMarketKind(question, marketTypeRaw) {
  const mt = String(marketTypeRaw || '').toUpperCase();
  if (mt === 'POLITICS') return { type: 'politics', category: 'POLITICS' };
  if (mt === 'SPORTS') return { type: 'sport', category: 'SPORTS' };
  if (mt === 'CRYPTO') return { type: 'crypto', category: 'CRYPTO' };
  if (question.includes(' vs ')) return { type: 'sport', category: 'SPORTS' };
  return { type: 'crypto', category: 'CRYPTO' };
}

async function readMarketField(market, functionName, fallback) {
  return client.readContract({
    address: market,
    abi: MarketArtifact.abi,
    functionName,
  }).catch(() => fallback);
}

function buildActiveMarketRow(market, values) {
  const question = String(values[0] || '');
  if (!question) return null;
  const strikePriceRaw = BigInt(values[1] || 0n);
  const endTime = Number(values[2] || 0n);
  const bettingEndTime = Number(values[3] || 0n);
  const resolved = Boolean(values[4]);
  const yesPoolRaw = BigInt(values[5] || 0n);
  const noPoolRaw = BigInt(values[6] || 0n);
  const settlementPriceRaw = BigInt(values[7] || 0n);
  const drawPoolRaw = BigInt(values[8] || 0n);
  const sideAName = String(values[9] || 'YES');
  const drawName = String(values[10] || 'Draw');
  const sideBName = String(values[11] || 'NO');
  const marketTypeRaw = String(values[12] || '');
  const winningOutcome = Number(values[13] || 0);
  const resultRaw = Boolean(values[14]);
  const yesPriceRaw = BigInt(values[15] || 0n);
  const { type, category } = detectMarketKind(question, marketTypeRaw);
  const isSport = category === 'SPORTS';
  const isPolitics = category === 'POLITICS';
  const sideAPool = Number(yesPoolRaw) / 1e18;
  const drawPool = Number(drawPoolRaw) / 1e18;
  const sideBPool = Number(noPoolRaw) / 1e18;
  const totalVolume = sideAPool + drawPool + sideBPool;
  let probYes;
  let probDraw;
  let probNo;
  if (totalVolume > 0) {
    probYes = sideAPool / totalVolume;
    probDraw = drawPool / totalVolume;
    probNo = sideBPool / totalVolume;
  } else if (isSport || isPolitics) {
    probYes = 0.4; probDraw = 0.2; probNo = 0.4;
  } else {
    const yp = Number(yesPriceRaw) / 1e16;
    probYes = yp > 0 && yp <= 100 ? yp / 100 : 0.5;
    probDraw = 0;
    probNo = 1 - probYes;
  }
  let resolvedOutcome = null;
  if (resolved) {
    resolvedOutcome = winningOutcome === 1 ? drawName : winningOutcome === 2 ? sideBName : sideAName;
    if (!marketTypeRaw && winningOutcome === 0) resolvedOutcome = resultRaw ? sideAName : sideBName;
  }
  const duration = inferDuration(question);
  const ticker = (isSport || isPolitics) ? (isSport ? 'SPORT' : 'POLITICS') : inferTicker(question);
  return {
    market_address: normalize(market),
    title: question,
    ticker,
    category,
    market_type: type,
    identifier: (isSport || isPolitics) ? question.replace(/\s+/g, '-').toLowerCase() : `${ticker}USDT`,
    side_a_name: sideAName,
    draw_name: drawName,
    side_b_name: sideBName,
    description: isPolitics ? 'Political prediction market — resolved manually by admin.' : isSport ? 'Football match — market closes at kickoff.' : 'Resolves via median of 10 exchange prices at market close.',
    strike_price: (isSport || isPolitics) ? null : Number(strikePriceRaw) / 1e8,
    deadline: endTime,
    betting_end_time: bettingEndTime,
    creation_date: Math.max(0, endTime - duration),
    resolution_source: isPolitics ? 'Admin manual' : isSport ? 'Live score API' : 'Median 10 exchanges',
    resolution_rule: isPolitics ? 'Resolved manually by platform admin based on real-world outcome.' : isSport ? `${sideAName} wins if they win, ${drawName} if level, ${sideBName} if they win.` : `${sideAName} wins when price >= strike at close.`,
    liquidity: totalVolume,
    volume: totalVolume,
    state: computeMarketState(resolved, bettingEndTime),
    resolved_outcome: resolvedOutcome,
    deadline_price: !(isSport || isPolitics) && resolved ? Number(settlementPriceRaw) / 1e8 : null,
    price_symbol: (isSport || isPolitics) ? '' : '$',
    prob_yes: probYes,
    prob_draw: probDraw,
    prob_no: probNo,
    percent_change: 0,
    updated_at: new Date().toISOString(),
  };
}

function normalizeMarketTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function marketEventKey(row) {
  return `${String(row.category || 'UNKNOWN').toUpperCase()}|${normalizeMarketTitle(row.title)}|${String(row.deadline || '0')}`;
}

function activeRowVolume(row) {
  const parsed = Number(row.volume || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPreferredActiveRow(candidate, current) {
  const candidateVolume = activeRowVolume(candidate);
  const currentVolume = activeRowVolume(current);
  if (candidateVolume !== currentVolume) return candidateVolume > currentVolume;
  return Number(candidate._factory_index || 0) < Number(current._factory_index || 0);
}

function dedupeActiveMarketRows(rows) {
  const byEvent = new Map();
  const duplicateAddresses = new Set();
  for (const row of rows) {
    const key = marketEventKey(row);
    const existing = byEvent.get(key);
    if (!existing) {
      byEvent.set(key, row);
      continue;
    }

    if (isPreferredActiveRow(row, existing)) {
      duplicateAddresses.add(existing.market_address);
      byEvent.set(key, row);
    } else {
      duplicateAddresses.add(row.market_address);
    }
  }

  return {
    rows: [...byEvent.values()].map(({ _factory_index, ...row }) => row),
    duplicateAddresses: [...duplicateAddresses],
  };
}

async function syncActiveMarkets(markets) {
  const rows = [];
  const resolvedMarkets = [];
  for (const [index, market] of markets.entries()) {
    const values = await Promise.all(MARKET_FIELDS.map((field) => readMarketField(market, field, field === 'resolved' || field === 'result' ? false : field === 'question' || field.endsWith('Name') || field === 'marketType' ? '' : 0n)));
    const row = buildActiveMarketRow(market, values);
    if (!row) continue;
    if (row.state === 'RESOLVED') resolvedMarkets.push(row.market_address);
    else rows.push({ ...row, _factory_index: index });
  }
  const deduped = dedupeActiveMarketRows(rows);
  if (deduped.rows.length) {
    const { error } = await supabase.from('active_markets').upsert(deduped.rows, { onConflict: 'market_address' });
    if (error) throw error;
  }
  const removableMarkets = [...new Set([...resolvedMarkets, ...deduped.duplicateAddresses])];
  if (removableMarkets.length) {
    const { error } = await supabase.from('active_markets').delete().in('market_address', removableMarkets);
    if (error) throw error;
  }
  console.log(`[indexer] active markets upserted=${deduped.rows.length}, removed_resolved=${resolvedMarkets.length}, removed_duplicates=${deduped.duplicateAddresses.length}`);
}

function pushActivity(user, activity, indexedActivityKeys, txMarketKeys) {
  const activityKey = `${activity.tx_hash}:${activity.log_index}`;
  if (indexedActivityKeys.has(activityKey)) return false;
  const exists = user.activities.some(
    (item) => item.tx_hash === activity.tx_hash && Number(item.log_index) === Number(activity.log_index)
  );
  if (exists) return false;
  user.activities.push(activity);
  indexedActivityKeys.add(activityKey);
  txMarketKeys.add(`${activity.tx_hash}:${activity.market_address}`);
  return true;
}

function outcomeName(outcome) {
  const id = Number(outcome);
  if (id === 1) return 'DRAW';
  if (id === 2) return 'SIDE_B';
  return 'SIDE_A';
}

function outcomeId(outcome) {
  const id = Number(outcome);
  return id === 1 || id === 2 ? id : 0;
}

async function scanRouterBets(markets, fromBlock, toBlock, users, indexedActivityKeys, txMarketKeys) {
  if (!ROUTER_ADDRESS || normalize(ROUTER_ADDRESS) === ZERO_ADDRESS) {
    console.warn('[indexer] NEXT_PUBLIC_ROUTER_ADDRESS is empty, skipping BetRouted scan');
    return;
  }

  const marketSet = new Set(markets.map(normalize));
  for (let cursor = fromBlock; cursor <= toBlock; cursor += CHUNK_SIZE) {
    const chunkTo = cursor + CHUNK_SIZE - 1n > toBlock ? toBlock : cursor + CHUNK_SIZE - 1n;
    const logs = await client.getLogs({
      address: ROUTER_ADDRESS,
      event: BetRoutedEvent,
      args: { market: markets },
      fromBlock: cursor,
      toBlock: chunkTo,
    }).catch((error) => {
      console.warn(`[indexer] router scan failed ${cursor}-${chunkTo}:`, error.shortMessage || error.message);
      return [];
    });

    for (const log of logs) {
      const userAddress = log.args.user;
      const marketAddress = log.args.market;
      const amount = log.args.amount;
      if (!userAddress || !marketAddress || amount === undefined || amount <= 0n) continue;
      const market = normalize(marketAddress);
      if (!marketSet.has(market)) continue;

      const user = getUser(users, userAddress);
      const outcome = outcomeName(log.args.outcome);
      user.markets.add(market);
      const inserted = pushActivity(user, {
        tx_hash: log.transactionHash,
        log_index: log.logIndex,
        user_address: user.address,
        market_address: market,
        type: 'BET',
        outcome: outcomeId(log.args.outcome),
        amount: amount.toString(),
        block_number: log.blockNumber.toString(),
        timestamp: Date.now(),
        status: 'RUNNING',
        resolved_outcome: null,
        payout: '0',
        claimed: false,
      }, indexedActivityKeys, txMarketKeys);
      if (inserted) {
        user.volume += amount;
        user.trades += 1;
        if (outcome === 'DRAW') user.draw += 1;
        else if (outcome === 'SIDE_B') user.sideB += 1;
        else user.sideA += 1;
      }
    }
    console.log(`[indexer] scanned router bets ${cursor}-${chunkTo}, logs=${logs.length}`);
  }
}

async function scanTransfers(markets, fromBlock, toBlock, users, indexedActivityKeys, txMarketKeys) {
  const marketSet = new Set(markets.map(normalize));
  for (let cursor = fromBlock; cursor <= toBlock; cursor += CHUNK_SIZE) {
    const chunkTo = cursor + CHUNK_SIZE - 1n > toBlock ? toBlock : cursor + CHUNK_SIZE - 1n;
    const logs = await client.getLogs({
      address: TOKEN_ADDRESS,
      event: TransferEvent,
      args: { to: markets },
      fromBlock: cursor,
      toBlock: chunkTo,
    }).catch((error) => {
      console.warn(`[indexer] transfer scan failed ${cursor}-${chunkTo}:`, error.shortMessage || error.message);
      return [];
    });

    for (const log of logs) {
      const from = log.args.from;
      const to = log.args.to;
      const value = log.args.value;
      if (!from || !to || value === undefined || value <= 0n) continue;
      const market = normalize(to);
      if (!marketSet.has(market)) continue;

      const user = getUser(users, from);
      const alreadyIndexedFromRouter = txMarketKeys.has(`${log.transactionHash}:${market}`);
      if (!alreadyIndexedFromRouter) {
        user.markets.add(market);
        const inserted = pushActivity(user, {
          tx_hash: log.transactionHash,
          log_index: log.logIndex,
          user_address: user.address,
          market_address: market,
          type: 'BET',
          outcome: null,
          amount: value.toString(),
          block_number: log.blockNumber.toString(),
          timestamp: Date.now(),
          status: 'RUNNING',
          resolved_outcome: null,
          payout: '0',
          claimed: false,
        }, indexedActivityKeys, txMarketKeys);
        if (inserted) {
          user.volume += value;
          user.trades += 1;
          user.sideA += 1; // exact outcome is reconciled from getUserPosition below
        }
      } else {
        user.markets.add(market);
      }
    }
    console.log(`[indexer] scanned transfers ${cursor}-${chunkTo}, logs=${logs.length}`);
  }
}

async function reconcilePositions(users) {
  for (const user of users.values()) {
    user.positionValue = 0n;
    user.sideA = 0;
    user.draw = 0;
    user.sideB = 0;

    for (const market of user.markets) {
      const [position, marketState, pools] = await Promise.all([
        client.readContract({
          address: market,
          abi: MarketArtifact.abi,
          functionName: 'getUserPosition',
          args: [user.address],
        }).catch(() => [0n, 0n, 0n, false]),
        Promise.all([
          client.readContract({ address: market, abi: MarketArtifact.abi, functionName: 'resolved' }).catch(() => false),
          client.readContract({ address: market, abi: MarketArtifact.abi, functionName: 'winningOutcome' }).catch(() => 0),
        ]),
        Promise.all([
          client.readContract({ address: market, abi: MarketArtifact.abi, functionName: 'yesPool' }).catch(() => 0n),
          client.readContract({ address: market, abi: MarketArtifact.abi, functionName: 'drawPool' }).catch(() => 0n),
          client.readContract({ address: market, abi: MarketArtifact.abi, functionName: 'noPool' }).catch(() => 0n),
        ]),
      ]);

      const raw = Array.isArray(position) ? position : [0n, 0n, 0n, false];
      const sideA = BigInt(raw[0] || 0n);
      const draw = BigInt(raw.length >= 4 ? raw[1] || 0n : 0n);
      const sideB = BigInt(raw.length >= 4 ? raw[2] || 0n : raw[1] || 0n);
      const total = sideA + draw + sideB;
      if (total <= 0n) continue;

      user.sideA += sideA > 0n ? 1 : 0;
      user.draw += draw > 0n ? 1 : 0;
      user.sideB += sideB > 0n ? 1 : 0;

      const resolved = Boolean(marketState[0]);
      const winner = Number(marketState[1] || 0);
      const winningPosition = winner === 1 ? draw : winner === 2 ? sideB : sideA;
      let positionValue = 0n;

      if (!resolved) {
        // Unrealized position: keep open markets neutral, same as current stake value.
        positionValue = total;
      } else if (winningPosition > 0n) {
        // Match PredictionMarket.claim():
        // totalPayout = userWinningBet * totalPool / winningPool
        // userPayout = totalPayout - 10% fee
        const sideAPool = BigInt(pools[0] || 0n);
        const drawPool = BigInt(pools[1] || 0n);
        const sideBPool = BigInt(pools[2] || 0n);
        const totalPool = sideAPool + drawPool + sideBPool;
        const winningPool = winner === 1 ? drawPool : winner === 2 ? sideBPool : sideAPool;
        if (totalPool > 0n && winningPool > 0n) {
          const grossPayout = (winningPosition * totalPool) / winningPool;
          const fee = (grossPayout * 10n) / 100n;
          positionValue = grossPayout - fee;
        }
      }

      user.positionValue += positionValue;
      user.positions.set(market, {
        sideA,
        draw,
        sideB,
        volume: total,
        payout: positionValue,
        pnl: positionValue - total,
        claimed: Boolean(raw[3]),
      });
      user.marketResults.set(market, {
        resolved,
        winner,
        positionValue,
        claimed: Boolean(raw[3]),
      });
    }

    // PNL is claimable/current value minus trading volume.
    // Open markets are neutral; resolved markets use the same proportional payout formula as claim().
    // Do not force volume up to payout value, otherwise profitable wins become 0 PNL.
    user.trades = Math.max(user.trades, user.sideA + user.draw + user.sideB);
  }
}

function buildLeaderboard(users) {
  const rows = [...users.values()]
    .filter((user) => user.volume > 0n || user.positionValue > 0n || user.trades > 0)
    .map((user) => ({
      user_address: user.address,
      volume: user.volume.toString(),
      payout: user.positionValue.toString(),
      pnl: (user.positionValue - user.volume).toString(),
      side_a_bets: user.sideA,
      draw_bets: user.draw,
      side_b_bets: user.sideB,
      total_bets: user.trades,
      volume_rank: 0,
      pnl_rank: 0,
      updated_at: new Date().toISOString(),
    }));

  [...rows]
    .sort((a, b) => (BigInt(b.volume) > BigInt(a.volume) ? 1 : BigInt(b.volume) < BigInt(a.volume) ? -1 : 0))
    .forEach((row, index) => { row.volume_rank = index + 1; });
  [...rows]
    .sort((a, b) => (BigInt(b.pnl) > BigInt(a.pnl) ? 1 : BigInt(b.pnl) < BigInt(a.pnl) ? -1 : 0))
    .forEach((row, index) => { row.pnl_rank = index + 1; });
  return rows;
}

function applyActivityResults(users) {
  for (const user of users.values()) {
    for (const activity of user.activities) {
      if (activity.type !== 'BET') continue;
      const market = normalize(activity.market_address);
      const result = user.marketResults.get(market);
      if (!result || !result.resolved) {
        activity.status = 'RUNNING';
        activity.resolved_outcome = null;
        activity.payout = '0';
        activity.claimed = false;
        continue;
      }

      const outcome = activity.outcome === null || activity.outcome === undefined ? null : Number(activity.outcome);
      const isWin = outcome !== null && outcome === result.winner;
      activity.status = isWin ? (result.claimed ? 'CLAIMED' : 'WIN') : 'LOSE';
      activity.resolved_outcome = result.winner;
      activity.payout = isWin ? result.positionValue.toString() : '0';
      activity.claimed = isWin && result.claimed;
    }
  }
}

async function cleanupFinalizedRunningActivities() {
  const { data, error } = await supabase
    .from('user_activities')
    .select('tx_hash, log_index, user_address, market_address, status')
    .in('status', ['RUNNING', 'WIN', 'LOSE', 'CLAIMED']);
  if (error) throw error;

  const finalizedMarkets = new Set();
  for (const row of data || []) {
    if (row.status === 'WIN' || row.status === 'LOSE' || row.status === 'CLAIMED') {
      finalizedMarkets.add(`${normalize(row.user_address)}:${normalize(row.market_address)}`);
    }
  }

  const staleRunningRows = (data || []).filter((row) => (
    row.status === 'RUNNING' && finalizedMarkets.has(`${normalize(row.user_address)}:${normalize(row.market_address)}`)
  ));

  for (const row of staleRunningRows) {
    const { error: deleteError } = await supabase
      .from('user_activities')
      .delete()
      .eq('tx_hash', row.tx_hash)
      .eq('log_index', row.log_index);
    if (deleteError) throw deleteError;
  }

  if (staleRunningRows.length) {
    console.log(`[indexer] deleted stale running activities=${staleRunningRows.length}`);
  }
}

async function save(users, leaderboardRows, lastProcessedBlock) {
  const now = new Date().toISOString();
  const portfolioRows = [];
  const activityRows = [];

  for (const user of users.values()) {
    for (const market of user.markets) {
      const position = user.positions.get(market) || {
        sideA: 0n,
        draw: 0n,
        sideB: 0n,
        volume: 0n,
        payout: 0n,
        pnl: 0n,
        claimed: false,
      };
      portfolioRows.push({
        user_address: user.address,
        market_address: market,
        side_a_amount: position.sideA.toString(),
        draw_amount: position.draw.toString(),
        side_b_amount: position.sideB.toString(),
        volume: position.volume.toString(),
        payout: position.payout.toString(),
        pnl: position.pnl.toString(),
        claimed: Boolean(position.claimed),
        updated_at: now,
      });
    }
    activityRows.push(...user.activities);
  }

  if (portfolioRows.length) {
    const { error } = await supabase.from('user_portfolios').upsert(portfolioRows, { onConflict: 'user_address,market_address' });
    if (error) throw error;
  }
  if (activityRows.length) {
    const hydratedActivityRows = activityRows.map((row) => ({
      ...row,
      status: row.status || 'RUNNING',
      resolved_outcome: row.resolved_outcome ?? null,
      payout: row.payout || '0',
      claimed: Boolean(row.claimed),
      updated_at: now,
    }));
    const { error } = await supabase.from('user_activities').upsert(hydratedActivityRows, { onConflict: 'tx_hash,log_index' });
    if (error) throw error;
  }
  if (leaderboardRows.length) {
    const { error } = await supabase.from('leaderboard').upsert(leaderboardRows, { onConflict: 'user_address' });
    if (error) throw error;
  }
  const { error } = await supabase.from('indexer_state').upsert({
    id: STATE_ID,
    last_processed_block: lastProcessedBlock.toString(),
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function tick() {
  if (reset) await resetTables();
  const latest = await client.getBlockNumber();
  const markets = await getMarkets();

  console.log(`[indexer] markets=${markets.length}, refreshing active market cache`);
  await syncActiveMarkets(markets);

  let last = explicitFromBlock !== null ? explicitFromBlock - 1n : await getState();
  if (last <= 0n) last = START_BLOCK - 1n;
  const fromBlock = last + 1n;
  const targetBlock = fromBlock + BLOCKS_PER_TICK - 1n > latest ? latest : fromBlock + BLOCKS_PER_TICK - 1n;

  if (fromBlock > latest) {
    console.log(`[indexer] event scan up to date at ${last}`);
    return;
  }

  console.log(`[indexer] scanning events ${fromBlock}-${targetBlock} / latest ${latest}`);
  const { users, indexedActivityKeys, txMarketKeys } = await readExistingUsers();
  await scanRouterBets(markets, fromBlock, targetBlock, users, indexedActivityKeys, txMarketKeys);
  await scanTransfers(markets, fromBlock, targetBlock, users, indexedActivityKeys, txMarketKeys);
  await reconcilePositions(users);
  applyActivityResults(users);
  const leaderboardRows = buildLeaderboard(users);
  await save(users, leaderboardRows, targetBlock);
  await cleanupFinalizedRunningActivities();
  console.log(`[indexer] saved users=${leaderboardRows.length}, lastProcessedBlock=${targetBlock}`);
}

async function main() {
  do {
    try {
      await tick();
    } catch (error) {
      console.error('[indexer] tick failed:', error);
      if (once) process.exitCode = 1;
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_MS));
  } while (true);
}

main();
