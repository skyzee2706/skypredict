import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type CachedLeaderboardEntry = {
    address: `0x${string}`;
    volume: string;
    payout: string;
    pnl: string;
    sideABets: number;
    drawBets: number;
    sideBBets: number;
    totalBets: number;
    volumeRank: number;
    pnlRank: number;
};

export type CachedActivity = {
    txHash: string;
    market: `0x${string}`;
    type: 'BET' | 'CLAIM';
    user: `0x${string}`;
    outcome?: number;
    amount: string;
    blockNumber: string;
    logIndex: number;
    timestamp: number;
};

export type IndexerCache = {
    version: 1;
    updatedAt: number;
    lastProcessedBlock: string;
    leaderboard: CachedLeaderboardEntry[];
    userPortfolios: Record<string, `0x${string}`[]>;
    userActivity: Record<string, CachedActivity[]>;
};

const EMPTY_CACHE: IndexerCache = {
    version: 1,
    updatedAt: 0,
    lastProcessedBlock: '0',
    leaderboard: [],
    userPortfolios: {},
    userActivity: {},
};

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'indexer-cache.json');
const TEMP_FILE = path.join(CACHE_DIR, 'indexer-cache.tmp.json');

export async function readIndexerCache(): Promise<IndexerCache> {
    try {
        const raw = await readFile(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<IndexerCache>;
        return {
            ...EMPTY_CACHE,
            ...parsed,
            version: 1,
            leaderboard: parsed.leaderboard ?? [],
            userPortfolios: parsed.userPortfolios ?? {},
            userActivity: parsed.userActivity ?? {},
        };
    } catch {
        return { ...EMPTY_CACHE };
    }
}

export async function writeIndexerCache(cache: IndexerCache) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(TEMP_FILE, JSON.stringify(cache, null, 2), 'utf8');
    await rename(TEMP_FILE, CACHE_FILE);
}

export function getEmptyIndexerCache(): IndexerCache {
    return { ...EMPTY_CACHE, userPortfolios: {}, userActivity: {}, leaderboard: [] };
}
