import { createPublicClient, parseAbiItem } from 'viem';
import { FACTORY_ABI, FACTORY_ADDRESS, TOKEN_ADDRESS } from '../constants';
import { LEADERBOARD_MAX_BLOCK_RANGE, LEADERBOARD_START_BLOCK } from '@/config/leaderboard';
import { CachedActivity, CachedLeaderboardEntry, IndexerCache, getEmptyIndexerCache, readIndexerCache, writeIndexerCache } from './cache';
import { saveIndexerCacheToSupabase } from './supabaseStore';

const BetPlacedEvent = parseAbiItem(
    'event BetPlaced(address indexed user, uint8 outcome, uint256 amount, uint256 ethFeePaid)'
);

const ClaimedEvent = parseAbiItem(
    'event Claimed(address indexed user, uint256 payout)'
);

const TransferEvent = parseAbiItem(
    'event Transfer(address indexed from, address indexed to, uint256 value)'
);

const MARKET_BET_ABI = [
    {
        type: 'function',
        name: 'getUserPosition',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [
            { type: 'uint256' },
            { type: 'uint256' },
            { type: 'uint256' },
            { type: 'bool' },
        ],
    },
] as const;

const MAX_ACTIVITY_PER_USER = 100;
const MAX_BLOCKS_PER_REFRESH = 3_000_000n;
const ZERO_FACTORY = '0x0000000000000000000000000000000000000000';

type PublicClient = ReturnType<typeof createPublicClient>;

type MutableUser = {
    volume: bigint;
    payout: bigint;
    sideA: number;
    draw: number;
    sideB: number;
};

type MarketUserPosition = {
    sideA: bigint;
    draw: bigint;
    sideB: bigint;
};

function compareBigintDesc(a: bigint, b: bigint) {
    if (a === b) return 0;
    return b > a ? 1 : -1;
}

function normalizeUser(address: string) {
    return address.toLowerCase() as `0x${string}`;
}

function buildUserMap(cache: IndexerCache) {
    const map = new Map<string, MutableUser>();
    for (const entry of cache.leaderboard) {
        map.set(entry.address.toLowerCase(), {
            volume: BigInt(entry.volume),
            payout: BigInt(entry.payout),
            sideA: entry.sideABets,
            draw: entry.drawBets,
            sideB: entry.sideBBets,
        });
    }
    return map;
}

function getUser(map: Map<string, MutableUser>, address: string) {
    const key = normalizeUser(address);
    let existing = map.get(key);
    if (!existing) {
        existing = { volume: 0n, payout: 0n, sideA: 0, draw: 0, sideB: 0 };
        map.set(key, existing);
    }
    return existing;
}

function addPortfolioMarket(cache: IndexerCache, user: string, market: `0x${string}`) {
    const key = normalizeUser(user);
    const current = cache.userPortfolios[key] ?? [];
    if (!current.some((item) => item.toLowerCase() === market.toLowerCase())) {
        cache.userPortfolios[key] = [...current, market];
    }
}

function addActivity(cache: IndexerCache, activity: CachedActivity) {
    const key = normalizeUser(activity.user);
    const current = cache.userActivity[key] ?? [];
    const id = `${activity.txHash}-${activity.logIndex}`;
    if (current.some((item) => `${item.txHash}-${item.logIndex}` === id)) return;

    cache.userActivity[key] = [activity, ...current]
        .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)) || b.logIndex - a.logIndex)
        .slice(0, MAX_ACTIVITY_PER_USER);
}

function rebuildLeaderboard(userMap: Map<string, MutableUser>): CachedLeaderboardEntry[] {
    const baseEntries: CachedLeaderboardEntry[] = Array.from(userMap.entries()).map(([addr, data]) => ({
        address: addr as `0x${string}`,
        volume: data.volume.toString(),
        payout: data.payout.toString(),
        pnl: (data.payout - data.volume).toString(),
        sideABets: data.sideA,
        drawBets: data.draw,
        sideBBets: data.sideB,
        totalBets: data.sideA + data.draw + data.sideB,
        volumeRank: 0,
        pnlRank: 0,
    }));

    const byVolume = [...baseEntries].sort((a, b) => compareBigintDesc(BigInt(a.volume), BigInt(b.volume)));
    byVolume.forEach((entry, index) => { entry.volumeRank = index + 1; });

    const byPnl = [...baseEntries].sort((a, b) => compareBigintDesc(BigInt(a.pnl), BigInt(b.pnl)));
    byPnl.forEach((entry, index) => { entry.pnlRank = index + 1; });

    return baseEntries;
}

async function reconcileStoragePositions(
    client: PublicClient,
    cache: IndexerCache,
    userMap: Map<string, MutableUser>,
) {
    const marketUsers = new Map<`0x${string}`, Set<`0x${string}`>>();
    for (const [user, markets] of Object.entries(cache.userPortfolios)) {
        for (const market of markets) {
            const users = marketUsers.get(market) ?? new Set<`0x${string}`>();
            users.add(user as `0x${string}`);
            marketUsers.set(market, users);
        }
    }

    const positionByUserMarket = new Map<string, MarketUserPosition>();
    for (const [market, users] of marketUsers) {
        for (const user of users) {
            const position = await client.readContract({
                address: market,
                abi: MARKET_BET_ABI,
                functionName: 'getUserPosition',
                args: [user],
            }).catch(() => [0n, 0n, 0n, false] as const);

            const [sideA, draw, sideB] = position;
            positionByUserMarket.set(`${user}-${market.toLowerCase()}`, { sideA, draw, sideB });
        }
    }

    for (const user of userMap.keys()) {
        const existing = userMap.get(user)!;
        existing.volume = 0n;
        existing.sideA = 0;
        existing.draw = 0;
        existing.sideB = 0;
    }

    for (const [key, position] of positionByUserMarket) {
        const user = key.split('-')[0];
        const existing = getUser(userMap, user);
        existing.volume += position.sideA + position.draw + position.sideB;
        existing.sideA += position.sideA > 0n ? 1 : 0;
        existing.draw += position.draw > 0n ? 1 : 0;
        existing.sideB += position.sideB > 0n ? 1 : 0;
    }
}

export async function refreshIndexerCache(client: PublicClient) {
    if (!FACTORY_ADDRESS || FACTORY_ADDRESS === ZERO_FACTORY) {
        return getEmptyIndexerCache();
    }

    const cache = await readIndexerCache();
    const markets = await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getAllMarkets',
    }) as `0x${string}`[];

    if (!markets.length) {
        const empty = getEmptyIndexerCache();
        await writeIndexerCache(empty);
        return empty;
    }

    const latestBlock = await client.getBlockNumber();
    const cachedLast = BigInt(cache.lastProcessedBlock || '0');
    const fromBlock = cachedLast > 0n ? cachedLast + 1n : LEADERBOARD_START_BLOCK;

    if (fromBlock > latestBlock) {
        cache.updatedAt = Date.now();
        await writeIndexerCache(cache);
        return cache;
    }

    const maxToBlock = fromBlock + MAX_BLOCKS_PER_REFRESH - 1n;
    const targetBlock = maxToBlock > latestBlock ? latestBlock : maxToBlock;
    const userMap = buildUserMap(cache);
    let cursor = fromBlock;

    while (cursor <= targetBlock) {
        const chunkToBlock = cursor + LEADERBOARD_MAX_BLOCK_RANGE - 1n > targetBlock
            ? targetBlock
            : cursor + LEADERBOARD_MAX_BLOCK_RANGE - 1n;

        const [betLogs, claimLogs, transferLogs] = await Promise.all([
            client.getLogs({
                address: markets,
                event: BetPlacedEvent,
                fromBlock: cursor,
                toBlock: chunkToBlock,
            }),
            client.getLogs({
                address: markets,
                event: ClaimedEvent,
                fromBlock: cursor,
                toBlock: chunkToBlock,
            }),
            client.getLogs({
                address: TOKEN_ADDRESS,
                event: TransferEvent,
                args: { to: markets },
                fromBlock: cursor,
                toBlock: chunkToBlock,
            }),
        ]);

        const betTransferIds = new Set<string>();

        for (const log of betLogs) {
            const { user, outcome, amount } = log.args;
            if (!user || outcome === undefined || amount === undefined) continue;

            betTransferIds.add(`${log.transactionHash}-${log.address.toLowerCase()}`);
            const existing = getUser(userMap, user);
            existing.volume += amount;
            existing.sideA += outcome === 0 ? 1 : 0;
            existing.draw += outcome === 1 ? 1 : 0;
            existing.sideB += outcome === 2 ? 1 : 0;

            addPortfolioMarket(cache, user, log.address);
            addActivity(cache, {
                txHash: log.transactionHash,
                market: log.address,
                type: 'BET',
                user: normalizeUser(user),
                outcome,
                amount: amount.toString(),
                blockNumber: log.blockNumber.toString(),
                logIndex: log.logIndex,
                timestamp: Date.now(),
            });
        }

        // Fallback for deployed markets whose BetPlaced ABI/indexed metadata differs
        // from the local artifact. A successful trade always transfers SkyUSD from
        // the user into the market contract, so this keeps volume/PNL accurate even
        // before a market is resolved.
        for (const log of transferLogs) {
            const { from, to, value } = log.args;
            if (!from || !to || value === undefined || value <= 0n) continue;
            if (betTransferIds.has(`${log.transactionHash}-${to.toLowerCase()}`)) continue;

            const existing = getUser(userMap, from);
            existing.volume += value;
            existing.sideA += 1;

            addPortfolioMarket(cache, from, to);
            addActivity(cache, {
                txHash: log.transactionHash,
                market: to,
                type: 'BET',
                user: normalizeUser(from),
                amount: value.toString(),
                blockNumber: log.blockNumber.toString(),
                logIndex: log.logIndex,
                timestamp: Date.now(),
            });
        }

        for (const log of claimLogs) {
            const { user, payout } = log.args;
            if (!user || payout === undefined) continue;

            const existing = getUser(userMap, user);
            existing.payout += payout;

            addActivity(cache, {
                txHash: log.transactionHash,
                market: log.address,
                type: 'CLAIM',
                user: normalizeUser(user),
                amount: payout.toString(),
                blockNumber: log.blockNumber.toString(),
                logIndex: log.logIndex,
                timestamp: Date.now(),
            });
        }

        cursor = chunkToBlock + 1n;
    }

    await reconcileStoragePositions(client, cache, userMap);
    cache.leaderboard = rebuildLeaderboard(userMap);
    cache.lastProcessedBlock = targetBlock.toString();
    cache.updatedAt = Date.now();
    await writeIndexerCache(cache);
    await saveIndexerCacheToSupabase(cache);

    return cache;
}
